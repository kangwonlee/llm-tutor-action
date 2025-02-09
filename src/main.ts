import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch'; // Import fetch

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

async function run(): Promise<void> {
  try {
    // Get inputs
    const reportFiles: string[] = core.getMultilineInput('report-files');
    const apiKey: string = core.getInput('api-key');
    const studentFiles: string[] = core.getMultilineInput('student-files');
    const readmePath: string = core.getInput('readme-path');
    const model: string = core.getInput('model') || 'gemini-1.5-flash-latest';
    const explanationIn: string = core.getInput('explanation-in') || 'English';
    const failExpected: boolean = core.getBooleanInput('fail-expected');

    // Validate inputs
    if (!apiKey) {
      throw new Error('API key is required');
    }
    if (!reportFiles.length) {
      throw new Error('At least one report file is required');
    }
    if (!studentFiles.length) {
      throw new Error('At least one student file is required');
    }

    // Collect pytest longrepr from multiple reports
    const pytestLongreprList: string = await collectLongreprFromMultipleReports(reportFiles, explanationIn);
    const nFailedTests: number = pytestLongreprList.length;

    // Get prompt
    const prompt: string = getPrompt(pytestLongreprList, studentFiles, readmePath, explanationIn);

    // Ask Gemini
    const answer: string = await askGemini(prompt, apiKey, model);

    // Set output
    core.setOutput('feedback', answer);

    // Check if the number of failed tests matches expectations
    if (failExpected) {
      if (nFailedTests === 0) {
        throw new Error('Expected at least one failed test, but none found');
      }
    } else {
      if (nFailedTests > 0) {
        throw new Error(`${nFailedTests} tests failed`);
      }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

export async function collectLongreprFromMultipleReports(reportPaths: string[], explanationIn: string): Promise<string> {
  let questions: string[] = [];

  for (const reportPath of reportPaths) {
    core.info(`Processing report file: ${reportPath}`);
    const data: any = JSON.parse(await readFileAsync(reportPath, 'utf-8'));
    const longreprList: string[] = collectLongrepr(data);
    questions.push(...longreprList);
  }

  if (questions.length) {
    questions.unshift(getReportHeader(explanationIn)); // line 71
    questions.push(getReportFooter(explanationIn)); // line 72
  }

  return questions.join('');
}

export function collectLongrepr(data: any): string[] {
  const longreprList: string[] = [];
  for (const test of data.tests) {
    if (test.outcome!== 'passed') {
      for (const key in test) {
        if (typeof test[key] === 'object' && 'longrepr' in test[key]) {
          longreprList.push(`${test.outcome}:${key}:${test[key].longrepr}`);  // line 84
        }
      }
    }
  }
  return longreprList;
}

export function getPrompt(
  pytestLongreprList: string,
  studentFiles: string[],
  readmePath: string,
  explanationIn: string,
): string {
  const initialInstruction: string = pytestLongreprList.length
  ? `${getDirective(explanationIn)}\nPlease generate comments mutually exclusive and collectively exhaustive for the following failed test cases.`
  : `In ${explanationIn}, please comment on the student code given the assignment instruction.`;

  const promptList: string[] = [
    initialInstruction,
    getInstructionBlock(readmePath, explanationIn),
    getStudentCodeBlock(studentFiles, explanationIn),
  ...pytestLongreprList,
  ];

  return promptList.join('\n\n');
}

export function getDirective(explanationIn: string): string {
  return `${loadLocale(explanationIn).directive}\n`;
}

export function getReportHeader(explanationIn: string): string {
  return `## ${loadLocale(explanationIn).report_header}\n`;
}

export function getReportFooter(explanationIn: string): string {
  return `## ${loadLocale(explanationIn).report_footer}\n`;
}

export function getInstructionBlock(readmePath: string, explanationIn: string): string {
  const readmeContent: string = fs.readFileSync(readmePath, 'utf-8');
  return `## ${loadLocale(explanationIn).instruction_start}\n${assignmentInstruction(readmeContent)}\n## ${loadLocale(explanationIn).instruction_end}\n`;
}

export function getStudentCodeBlock(studentFiles: string[], explanationIn: string): string {
  const studentCode: string = studentFiles
  .map((file) => {
      const content: string = fs.readFileSync(file, 'utf-8');
      return `# begin: ${path.basename(file)} ======\n${content}\n# end: ${path.basename(file)} ======\n`;
    })
  .join('\n\n');
  return `\n\n##### Start mutable code block\n## ${loadLocale(explanationIn).homework_start}\n${studentCode}\n## ${loadLocale(explanationIn).homework_end}\n##### End mutable code block\n`;
}

export function assignmentInstruction(
  readmeContent: string,
  commonContentStartMarker: string = '``From here is common to all assignments.``',
  commonContentEndMarker: string = '``Until here is common to all assignments.``',
): string {
  const pattern: RegExp = new RegExp(
    `(${commonContentStartMarker}\\s*.*?\\s*${commonContentEndMarker})`,
    'is',
  );
  const foundList: string[] = readmeContent.match(pattern) || []; // line 148

  let instruction: string = readmeContent;
  if (!foundList.length) {
    core.warning(
      `Common content markers '${commonContentStartMarker}' and '${commonContentEndMarker}' not found in README.md. Returning entire file.`,
    );
  } else {
    for (const found of foundList) {
      instruction = instruction.replace(found, '');
    }
  }

  return instruction;
}

export function loadLocale(language: string): any {
  const localePath: string = path.join(__dirname, 'locale', `${language}.json`);
  const localeContent: string = fs.readFileSync(localePath, 'utf-8');
  return JSON.parse(localeContent);
}

export async function askGemini(question: string, apiKey: string, model: string): Promise<string> {
  const url: string = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const headers: any = { 'Content-Type': 'application/json' };
  const data: any = { contents: [{ parts: [{ text: question }] }] };

  core.info('Sending request to Gemini...');
  const response: any = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}: ${response.statusText}`);
  }

  core.info('Parsing response...');
  const result: any = await response.json();
  const results: string[] = result.candidates.content.parts.map((part: any) => part.text);
  return results.join('\n');
}

// Run the action
run();
