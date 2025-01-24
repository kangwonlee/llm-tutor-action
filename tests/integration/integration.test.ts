import * as core from '@actions/core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { mocked } from 'jest-mock';
import * as main from '../../src/main'; // Import your action's main file
import * as glob from '@actions/glob'
import {Response} from "node-fetch";

// Mock the @actions/core module
jest.mock('@actions/core');
jest.mock('@actions/glob');
jest.mock('fs');
jest.mock('node-fetch');

const mockedGlob = mocked(glob, { shallow: true });
const mockedFs = mocked(fs, { shallow: false });
const mockedCore = mocked(core, { shallow: true });
const mockedFetch = jest.mocked(fetch, { shallow: true });

describe('Integration Test', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        process.env = { ...OLD_ENV };
        mockedFs.readFile.mockReset();
        mockedGlob.create.mockReset();
    });

    afterEach(() => {
        process.env = OLD_ENV;
    });

    it('runs the action and produces the expected output', async () => {

        // Mock inputs
        mockedCore.getInput.mockImplementation((name: string) => {
            switch (name) {
                case 'report-files':
                    return 'tests/sample_report.json';
                case 'student-files':
                    return 'tests/sample_code.py';
                case 'readme-path':
                    return 'tests/sample_readme.md';
                case 'api-key':
                    return 'mock-api-key';
                case 'explanation-in':
                    return 'English';
                default:
                    return '';
            }
        });

        mockedCore.getBooleanInput.mockImplementation((name: string) => {
            switch (name) {
                case 'fail-expected':
                    return false;
                default:
                    return false;
            }
        });

        // Mock glob to find files based on provided patterns
        const mockGlobber = {
            glob: jest.fn().mockResolvedValue(['tests/sample_report.json', 'tests/sample_code.py']),
        };
        mockedGlob.create.mockResolvedValue(mockGlobber as unknown as glob.Globber);

        // Mock fs.readFile
        const mockReportContent = JSON.stringify({
            tests: [
                {
                    outcome: 'failed',
                    nodeid: 'test_foo',
                    longrepr: { longrepr: 'AssertionError: assert 1 == 2' },
                },
            ],
        });
        const mockCodeContent = 'def foo():\n    return 1';
        const mockReadmeContent = 'Sample README content';

        mockedFs.readFile.mockImplementation(async (filePath: string) => {
            if (filePath === path.resolve('tests/sample_report.json')) {
              return mockReportContent;
            } else if (filePath === path.resolve('tests/sample_code.py')) {
              return mockCodeContent;
            } else if (filePath === path.resolve('tests/sample_readme.md')) {
              return mockReadmeContent;
            }
            throw new Error(`File not found: ${filePath}`);
        });

        mockedFs.existsSync.mockImplementation((filePath) => {
            // Simulate that the specified files exist
            return [
                path.resolve('tests/sample_report.json'),
                path.resolve('tests/sample_code.py'),
                path.resolve('tests/sample_readme.md')
            ].includes(path.resolve(filePath.toString()));
        });

        // Mock the Gemini API response
        const mockGeminiResponse = {
            candidates: [{ content: { parts: [{ text: 'This is the feedback from Gemini.' }] } }],
        };

        mockedFetch.mockResolvedValue({
            json: () => Promise.resolve(mockGeminiResponse),
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockGeminiResponse)),
        } as Response);

        // Run the action
        await main.run();

        // Assertions
        expect(mockedCore.getInput).toHaveBeenCalledTimes(5);
        expect(mockedCore.getInput).toHaveBeenCalledWith('report-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('student-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('readme-path');
        expect(mockedCore.getInput).toHaveBeenCalledWith('api-key');
        expect(mockedCore.getInput).toHaveBeenCalledWith('explanation-in');
        expect(mockedGlob.create).toHaveBeenCalledWith('tests/sample_report.json\ntests/sample_code.py');
        expect(mockedGlobber.glob).toHaveBeenCalled();
        expect(mockedFs.readFile).toHaveBeenCalledTimes(3);
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_report.json'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_code.py'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_readme.md'), 'utf-8');
        expect(mockedFetch).toHaveBeenCalled();
        expect(mockedCore.info).toHaveBeenCalledWith('This is the feedback from Gemini.');
        expect(mockedCore.setOutput).toHaveBeenCalledWith('feedback', 'This is the feedback from Gemini.');
        expect(mockedCore.setFailed).not.toHaveBeenCalled();
    });

    it('should fail when no failed tests and fail-expected is false', async () => {
        // Mock inputs
        mockedCore.getInput.mockImplementation((name: string) => {
            switch (name) {
                case 'report-files':
                    return 'tests/sample_report.json';
                case 'student-files':
                    return 'tests/sample_code.py';
                case 'readme-path':
                    return 'tests/sample_readme.md';
                case 'api-key':
                    return 'mock-api-key';
                case 'explanation-in':
                    return 'English';
                default:
                    return '';
            }
        });

        mockedCore.getBooleanInput.mockImplementation((name: string) => {
            switch (name) {
                case 'fail-expected':
                    return false; // fail-expected is false
                default:
                    return false;
            }
        });

        // Mock glob to find files based on provided patterns
        const mockGlobber = {
            glob: jest.fn().mockResolvedValue(['tests/sample_report.json', 'tests/sample_code.py']),
        };
        mockedGlob.create.mockResolvedValue(mockGlobber as unknown as glob.Globber);

        // Mock fs.readFile
        const mockReportContent = JSON.stringify({
            tests: [
                {
                    outcome: 'passed',
                    nodeid: 'test_foo',
                },
            ],
        });
        const mockCodeContent = 'def foo():\n    return 1';
        const mockReadmeContent = 'Sample README content';

        mockedFs.readFile.mockImplementation(async (filePath: string) => {
            if (filePath === path.resolve('tests/sample_report.json')) {
              return mockReportContent;
            } else if (filePath === path.resolve('tests/sample_code.py')) {
              return mockCodeContent;
            } else if (filePath === path.resolve('tests/sample_readme.md')) {
              return mockReadmeContent;
            }
            throw new Error(`File not found: ${filePath}`);
        });

        mockedFs.existsSync.mockImplementation((filePath) => {
            // Simulate that the specified files exist
            return [
                path.resolve('tests/sample_report.json'),
                path.resolve('tests/sample_code.py'),
                path.resolve('tests/sample_readme.md')
            ].includes(path.resolve(filePath.toString()));
        });

        // Mock the Gemini API response
        const mockGeminiResponse = {
            candidates: [{ content: { parts: [{ text: 'This is the feedback from Gemini.' }] } }],
        };

        mockedFetch.mockResolvedValue({
            json: () => Promise.resolve(mockGeminiResponse),
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockGeminiResponse)),
        } as Response);

        // Run the action
        await main.run();

        // Assertions
        expect(mockedCore.getInput).toHaveBeenCalledTimes(5);
        expect(mockedCore.getInput).toHaveBeenCalledWith('report-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('student-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('readme-path');
        expect(mockedCore.getInput).toHaveBeenCalledWith('api-key');
        expect(mockedCore.getInput).toHaveBeenCalledWith('explanation-in');
        expect(mockedGlob.create).toHaveBeenCalledWith('tests/sample_report.json\ntests/sample_code.py');
        expect(mockedGlobber.glob).toHaveBeenCalled();
        expect(mockedFs.readFile).toHaveBeenCalledTimes(3);
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_report.json'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_code.py'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_readme.md'), 'utf-8');
        expect(mockedFetch).toHaveBeenCalled();
        expect(mockedCore.info).toHaveBeenCalledWith('This is the feedback from Gemini.');
        expect(mockedCore.setOutput).toHaveBeenCalledWith('feedback', 'This is the feedback from Gemini.');
        expect(mockedCore.setFailed).toHaveBeenCalledWith('0 failed tests');
    });
    it('should not fail when no failed tests and fail-expected is true', async () => {
        // Mock inputs
        mockedCore.getInput.mockImplementation((name: string) => {
            switch (name) {
                case 'report-files':
                    return 'tests/sample_report.json';
                case 'student-files':
                    return 'tests/sample_code.py';
                case 'readme-path':
                    return 'tests/sample_readme.md';
                case 'api-key':
                    return 'mock-api-key';
                case 'explanation-in':
                    return 'English';
                default:
                    return '';
            }
        });

        mockedCore.getBooleanInput.mockImplementation((name: string) => {
            switch (name) {
                case 'fail-expected':
                    return true; // fail-expected is true
                default:
                    return false;
            }
        });

        // Mock glob to find files based on provided patterns
        const mockGlobber = {
            glob: jest.fn().mockResolvedValue(['tests/sample_report.json', 'tests/sample_code.py']),
        };
        mockedGlob.create.mockResolvedValue(mockGlobber as unknown as glob.Globber);

        // Mock fs.readFile
        const mockReportContent = JSON.stringify({
            tests: [
                {
                    outcome: 'passed',
                    nodeid: 'test_foo',
                },
            ],
        });
        const mockCodeContent = 'def foo():\n    return 1';
        const mockReadmeContent = 'Sample README content';

        mockedFs.readFile.mockImplementation(async (filePath: string) => {
            if (filePath === path.resolve('tests/sample_report.json')) {
              return mockReportContent;
            } else if (filePath === path.resolve('tests/sample_code.py')) {
              return mockCodeContent;
            } else if (filePath === path.resolve('tests/sample_readme.md')) {
              return mockReadmeContent;
            }
            throw new Error(`File not found: ${filePath}`);
        });

        mockedFs.existsSync.mockImplementation((filePath) => {
            // Simulate that the specified files exist
            return [
                path.resolve('tests/sample_report.json'),
                path.resolve('tests/sample_code.py'),
                path.resolve('tests/sample_readme.md')
            ].includes(path.resolve(filePath.toString()));
        });

        // Mock the Gemini API response
        const mockGeminiResponse = {
            candidates: [{ content: { parts: [{ text: 'This is the feedback from Gemini.' }] } }],
        };

        mockedFetch.mockResolvedValue({
            json: () => Promise.resolve(mockGeminiResponse),
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockGeminiResponse)),
        } as Response);

        // Run the action
        await main.run();

        // Assertions
        expect(mockedCore.getInput).toHaveBeenCalledTimes(5);
        expect(mockedCore.getInput).toHaveBeenCalledWith('report-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('student-files');
        expect(mockedCore.getInput).toHaveBeenCalledWith('readme-path');
        expect(mockedCore.getInput).toHaveBeenCalledWith('api-key');
        expect(mockedCore.getInput).toHaveBeenCalledWith('explanation-in');
        expect(mockedGlob.create).toHaveBeenCalledWith('tests/sample_report.json\ntests/sample_code.py');
        expect(mockedGlobber.glob).toHaveBeenCalled();
        expect(mockedFs.readFile).toHaveBeenCalledTimes(3);
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_report.json'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_code.py'), 'utf-8');
        expect(mockedFs.readFile).toHaveBeenCalledWith(path.resolve('tests/sample_readme.md'), 'utf-8');
        expect(mockedFetch).toHaveBeenCalled();
        expect(mockedCore.info).toHaveBeenCalledWith('This is the feedback from Gemini.');
        expect(mockedCore.setOutput).toHaveBeenCalledWith('feedback', 'This is the feedback from Gemini.');
        expect(mockedCore.setFailed).toHaveBeenCalledWith('No failed tests');
    });
});
