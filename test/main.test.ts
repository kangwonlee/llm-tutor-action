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

    // Mock the file system - Correctly mock with string values
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
    mockedFs.readFileSync.mockReturnValue( // Mock readFileSync
      "## Test Report\nfailed:setup:Error in setup\n## End of Test Report\n"
    )

    const result = await collectLongreprFromMultipleReports(reportPaths, explanationIn);

    expect(result).toEqual(
      "## Test Report\nfailed:setup:Error in setupfailed:call:Error in call## End of Test Report\n"
    );
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
describe('getInstructionBlock', () => {
    it('should return instruction block with content when file exists', () => {
      const readmePath = 'path/to/readme.md';
      const explanationIn = 'English';
      const mockContent = 'Test README content';
      mockedFs.readFileSync.mockReturnValue(mockContent); // Correctly mock readFileSync

      const result = getInstructionBlock(readmePath, explanationIn);

      expect(result).toContain(mockContent); // Check that the content is included
    });

    it('should return instruction block with error message when file does not exist', () => {
      const readmePath = 'nonexistent/path/readme.md';
      const explanationIn = 'English';
      mockedFs.readFileSync.mockImplementation(() => { // Simulate file not found
        throw new Error('File not found');
      });

      const result = getInstructionBlock(readmePath, explanationIn);

      expect(result).toContain('Error reading README file'); // Check the fallback message
    });
  });

