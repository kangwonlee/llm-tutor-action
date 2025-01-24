import { promises as fsPromises } from 'fs'; // For async operations, if needed in the future
import * as fs from 'fs'; // For sync operations: existsSync, statSync, readFileSync
import * as path from 'path';
import fetch, { HeadersInit, Response } from 'node-fetch';

const RESOURCE_EXHAUSTED = 429;

// Interface for Gemini API response
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

function url(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}

async function askGemini(
  question: string,
  apiKey: string,
  retryDelaySec = 5.0,
  maxRetryAttempt = 3,
  timeoutSec = 60
): Promise<string | null> {
  const data = { contents: [{ parts: [{ text: question }] }] };
  const startTime = Date.now();
  let answer: string | null = null;

  for (let attempt = 0; attempt <= maxRetryAttempt; attempt++) {
    if (Date.now() - startTime > timeoutSec * 1000) {
      console.error(`Timeout exceeded for question: ${question}`);
      break;
    }

    const response = await fetch(url(apiKey), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });

    if (response.status === 200) {
      const result: GeminiResponse = await response.json() as GeminiResponse;
      const results = result.candidates[0].content.parts.map(
        (part: { text: string }) => part.text
      );
      answer = results.join('\n');
      break;
    } else if (response.status === RESOURCE_EXHAUSTED) {
      if (attempt < maxRetryAttempt) {
        const delay = retryDelaySec * 2 ** attempt;
        console.warn(
          `Rate limit exceeded. Retrying in ${delay} seconds... (Attempt ${attempt + 1}/${maxRetryAttempt})`
        );
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      } else {
        console.error(`Max retries exceeded for RESOURCE_EXHAUSTED error. Question: ${question}`);
      }
    } else {
      console.error(`API request failed with status code ${response.status}: ${await response.text()}`);
    }
  }

  return answer;
}

export async function geminiQna(
  reportPaths: string[],
  studentFiles: string[],
  readmeFile: string,
  apiKey: string,
  explanationIn = 'English'
): Promise<[number, string]> {
  console.info('Starting Gemini Q&A process...');
  console.info(`Report paths: ${reportPaths}`);
  console.info(`Student files: ${studentFiles}`);
  console.info(`Readme file: ${readmeFile}`);

  const [nFailed, consolidatedQuestion] = await getPrompt(reportPaths, studentFiles, readmeFile, explanationIn);

  const answers = await askGemini(consolidatedQuestion, apiKey);

  return [nFailed, answers || ''];
}

async function getPrompt(
  reportPaths: string[],
  studentFiles: string[],
  readmeFile: string,
  explanationIn: string
): Promise<[number, string]> {
  const pytestLongreprList = await collectLongreprFromMultipleReports(reportPaths, explanationIn);

  const nFailedTests = pytestLongreprList.length;

  const getInitialInstruction = (questions: string[], language: string): string => {
    if (questions.length > 0) {
      return (
        getDirective(language) +
        '\n' +
        'Please generate comments mutually exclusive and collectively exhaustive for the following failed test cases.'
      );
    } else {
      return `In ${language}, please comment on the student code given the assignment instruction.`;
    }
  };

  const promptList = [
    getInitialInstruction(pytestLongreprList, explanationIn),
    await getInstructionBlock(readmeFile, explanationIn),
    await getStudentCodeBlock(studentFiles, explanationIn),
    ...pytestLongreprList,
  ];

  const promptStr = promptList.join('\n\n');

  return [nFailedTests, promptStr];
}

async function collectLongreprFromMultipleReports(
  pytestJsonReportPaths: string[],
  explanationIn: string
): Promise<string[]> {
  const questions: string[] = [];

  for (const pytestJsonReportPath of pytestJsonReportPaths) {
    console.info(`Processing report file: ${pytestJsonReportPath}`);
    const data = JSON.parse(await fsPromises.readFile(pytestJsonReportPath, 'utf-8'));

    const longreprList = collectLongrepr(data);

    questions.push(...longreprList);
  }

  if (questions.length > 0) {
    questions.unshift(getReportHeader(explanationIn));
    questions.push(getReportFooter(explanationIn));
  }

  return questions;
}

function getDirective(explanationIn: string): string {
  return `${loadLocale(explanationIn)['directive']}\n`;
}

function collectLongrepr(data: any): string[] {
  const longreprList: string[] = [];
  for (const r of data['tests']) {
    if (r['outcome'] !== 'passed') {
      for (const k in r) {
        if (typeof r[k] === 'object' && r[k] !== null && 'longrepr' in r[k]) {
          longreprList.push(`${r['outcome']}:${k}:${r[k]['longrepr']}`);
        }
      }
    }
  }
  return longreprList;
}

function getReportHeader(explanationIn: string): string {
  return `## ${loadLocale(explanationIn)['report_header']}\n`;
}

function getReportFooter(explanationIn: string): string {
  return `## ${loadLocale(explanationIn)['report_footer']}\n`;
}

async function getInstructionBlock(readmeFile: string, explanationIn = 'English'): Promise<string> {
  return (
    `## ${loadLocale(explanationIn)['instruction_start']}\n` +
    `${await fsPromises.readFile(readmeFile, 'utf-8')}\n` +
    `## ${loadLocale(explanationIn)['instruction_end']}\n`
  );
}

async function getStudentCodeBlock(studentFiles: string[], explanationIn: string): Promise<string> {
  return (
    '\n\n##### Start mutable code block\n' +
    `## ${loadLocale(explanationIn)['homework_start']}\n` +
    `${await assignmentCode(studentFiles)}\n` +
    `## ${loadLocale(explanationIn)['homework_end']}\n` +
    '##### End mutable code block\n'
  );
}

async function assignmentCode(studentFiles: string[]): Promise<string> {
  const fileContents = await Promise.all(
    studentFiles.map(async f => {
      const content = await fsPromises.readFile(f, 'utf-8');
      return `# begin : ${path.basename(f)} ======\n${content}\n# end : ${path.basename(f)} ======\n`;
    })
  );
  return fileContents.join('\n\n');
}

function loadLocale(explainIn: string): Record<string, string> {
  const localeFolder = path.join(__dirname, 'locale');
  const localeFile = path.join(localeFolder, `${explainIn}.json`);

  if (!fs.existsSync(localeFolder) || !fs.statSync(localeFolder).isDirectory()) {
    throw new Error(`Locale folder not found or is not a directory: ${localeFolder}`);
  }

  if (!fs.existsSync(localeFile) || !fs.statSync(localeFile).isFile()) {
    throw new Error(`Locale file not found or is not a file: ${localeFile}`);
  }

  return JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
}
