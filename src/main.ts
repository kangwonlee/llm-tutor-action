// src/main.ts
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as fs from 'fs';
import * as path from 'path';
import { geminiQna } from './ai_tutor';

async function run(): Promise<void> {
  try {
    const reportFilesStr: string = core.getInput('report-files');
    const reportFiles: string[] = await getPathArray(reportFilesStr);

    const studentFilesStr: string = core.getInput('student-files');
    const studentFiles: string[] = await getPathArray(studentFilesStr);

    const readmeFileStr: string = core.getInput('readme-path');
    const readmeFile: string = path.resolve(readmeFileStr);
    if (!fs.existsSync(readmeFile)) {
      throw new Error('No README file found');
    }

    const apiKey: string = core.getInput('api-key');
    const explanationIn: string = core.getInput('explanation-in');

    const [nFailed, feedback] = await geminiQna(
      reportFiles,
      studentFiles,
      readmeFile,
      apiKey,
      explanationIn
    );

    core.info(feedback);

    core.setOutput('feedback', feedback);

    const bFailExpected = core.getBooleanInput('fail-expected');

    if (!bFailExpected) {
      if (nFailed > 0) {
        core.setFailed(`${nFailed} failed tests`);
      }
    } else {
      if (nFailed === 0) {
        core.setFailed('No failed tests');
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

async function getPathArray(pathsStr: string): Promise<string[]> {
  const patterns = pathsStr.split(',').map(s => s.trim());
  const globber = await glob.create(patterns.join('\n'));
  const files = await globber.glob();

  if (files.length === 0) {
    core.warning('No valid paths found');
  }

  return files;
}

run();
