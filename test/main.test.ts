import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  collectLongreprFromMultipleReports,
  collectLongrepr,
  getPrompt,
  getDirective,
  getReportHeader,
  getReportFooter,
  getInstructionBlock,
  getStudentCodeBlock,
  assignmentInstruction,
  loadLocale,
  askGemini,
} from '../src/main';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Mock the @actions/core module
jest.mock('@actions/core');
const mockedCore = jest.mocked(core);

// Mock the @actions/github module
jest.mock('@actions/github');
const mockedGithub = jest.mocked(github);

// Mock the fs module
jest.mock('fs');
const mockedFs = jest.mocked(fs);

describe('collectLongreprFromMultipleReports', () => {
  it('should collect longrepr from multiple reports', async () => {
    const reportPaths = ['report1.json', 'report2.json'];
    const explanationIn = 'English';

    // Mock the file system
    mockedFs.readFile.mockResolvedValueOnce(
      JSON.stringify({
        tests: [
          {
            outcome: 'failed',
            setup: { longrepr: 'Error in setup' },
          },
        ],
      }),
    );
    mockedFs.readFile.mockResolvedValueOnce(
      JSON.stringify({
        tests: [
          {
            outcome: 'failed',
            call: { longrepr: 'Error in call' },
          },
        ],
      }),
    );

    const result = await collectLongreprFromMultipleReports(reportPaths, explanationIn);

    expect(result).toEqual([
      '## Test Report\n',
      'failed:setup:Error in setup',
      'failed:call:Error in call',
      '## End of Test Report\n',
    ]);
  });
});

describe('collectLongrepr', () => {
  it('should collect longrepr from a single report', () => {
    const data = {
      tests: [
        {
          outcome: 'failed',
          setup: { longrepr: 'Error in setup' },
        },
        {
          outcome: 'passed',
          call: { longrepr: 'Error in call' },
        },
      ],
    };

    const result = collectLongrepr(data);

    expect(result).toEqual(['failed:setup:Error in setup']);
  });
});

// Add more test cases for other functions...
