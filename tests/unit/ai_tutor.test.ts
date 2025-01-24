import { promises as fs } from 'fs';
import * as aiTutor from '../../src/ai_tutor';
import { mocked } from 'jest-mock';
import { Response } from 'node-fetch';

jest.mock('node-fetch');
jest.mock('fs');
const mockedFs = mocked(fs, { shallow: false });
const mockedFetch = jest.mocked(fetch, { shallow: true });
// Helper function to create a mock fetch response
const createMockFetchResponse = (data: unknown, status = 200) => {
    return Promise.resolve({
        json: () => Promise.resolve(data),
        status,
        text: () => Promise.resolve(JSON.stringify(data)),
    } as Response);
};


describe('ai_tutor Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedFs.readFile.mockReset();
        mockedFetch.mockReset();
    });

    describe('askGemini', () => {
        it('should return the answer from Gemini on successful API call', async () => {
            const mockQuestion = 'What is the meaning of life?';
            const mockAnswer = '42';
            const mockApiKey = 'test-api-key';
            const mockResponse = {
                candidates: [{ content: { parts: [{ text: mockAnswer }] } }],
            };
            mockedFetch.mockResolvedValue(createMockFetchResponse(mockResponse));

            const answer = await aiTutor.askGemini(mockQuestion, mockApiKey);

            expect(answer).toBe(mockAnswer);
            expect(mockedFetch).toHaveBeenCalledWith(
                expect.stringContaining(mockApiKey),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.anything(),
                    body: JSON.stringify({ contents: [{ parts: [{ text: mockQuestion }] }] }),
                })
            );
        });

        it('should retry on rate limit error', async () => {
            const mockQuestion = 'What is the meaning of life?';
            const mockAnswer = '42';
            const mockApiKey = 'test-api-key';
            const mockResponse = {
                candidates: [{ content: { parts: [{ text: mockAnswer }] } }],
            };

            mockedFetch
                .mockResolvedValueOnce(createMockFetchResponse({}, 429))  // First call: Rate limit error
                .mockResolvedValueOnce(createMockFetchResponse(mockResponse)); // Second call: Success

            const answer = await aiTutor.askGemini(mockQuestion, mockApiKey);

            expect(answer).toBe(mockAnswer);
            expect(mockedFetch).toHaveBeenCalledTimes(2);
        });

        it('should return null on exceeding max retries', async () => {
            const mockQuestion = 'What is the meaning of life?';
            const mockApiKey = 'test-api-key';

            mockedFetch.mockResolvedValue(createMockFetchResponse({}, 429));

            const answer = await aiTutor.askGemini(mockQuestion, mockApiKey, 5, 0); // 0 retries to speed up the test

            expect(answer).toBeNull();
            expect(mockedFetch).toHaveBeenCalledTimes(1); // Only the initial call
        });

        it('should return null on timeout', async () => {
            const mockQuestion = 'What is the meaning of life?';
            const mockApiKey = 'test-api-key';

            // Simulate a slow response that exceeds the timeout
            mockedFetch.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(createMockFetchResponse({})), 2000))
            );

            const answer = await aiTutor.askGemini(mockQuestion, mockApiKey, 5, 3, 1); // 1 second timeout

            expect(answer).toBeNull();
        });
    });

    describe('geminiQna', () => {
        it('should call askGemini with the correct prompt', async () => {
            const mockReportPaths = ['/path/to/report.json'];
            const mockStudentFiles = ['/path/to/code.py'];
            const mockReadmeFile = '/path/to/README.md';
            const mockApiKey = 'test-api-key';
            const mockExplanationIn = 'English';
            const mockPrompt = 'This is the consolidated prompt';
            const mockAnswer = 'This is the answer from Gemini';

            mockedFs.readFile.mockImplementation((path: string) => {
                if (path === mockReportPaths[0]) {
                    return Promise.resolve(JSON.stringify({ tests: [] }));
                } else if (path === mockReadmeFile) {
                    return Promise.resolve('Sample README content');
                } else if (path === mockStudentFiles[0]) {
                    return Promise.resolve('def foo():\n    return 1');
                }
                return Promise.reject(new Error('File not found'));
            });

            // Mock getPrompt to return a predefined prompt
            jest.spyOn(aiTutor, 'getPrompt').mockResolvedValue([0, mockPrompt]);

            // Mock askGemini to return a predefined answer
            jest.spyOn(aiTutor, 'askGemini').mockResolvedValue(mockAnswer);

            const [nFailed, answer] = await aiTutor.geminiQna(
                mockReportPaths,
                mockStudentFiles,
                mockReadmeFile,
                mockApiKey,
                mockExplanationIn
            );

            expect(nFailed).toBe(0);
            expect(answer).toBe(mockAnswer);
            expect(aiTutor.getPrompt).toHaveBeenCalledWith(
                mockReportPaths,
                mockStudentFiles,
                mockReadmeFile,
                mockExplanationIn
            );
            expect(aiTutor.askGemini).toHaveBeenCalledWith(mockPrompt, mockApiKey);
        });
    });

    describe('getPrompt', () => {
        it('should construct the correct prompt with failed tests', async () => {
            const mockReportPaths = ['/path/to/report.json'];
            const mockStudentFiles = ['/path/to/code.py'];
            const mockReadmeFile = '/path/to/README.md';
            const mockExplanationIn = 'English';

            const mockReportData = {
                tests: [
                    {
                        outcome: 'failed',
                        nodeid: 'test_foo',
                        longrepr: { longrepr: 'AssertionError: assert 1 == 2' },
                    },
                ],
            };

            mockedFs.readFile.mockImplementation((path: string) => {
                if (path === mockReportPaths[0]) {
                    return Promise.resolve(JSON.stringify(mockReportData));
                } else if (path === mockReadmeFile) {
                    return Promise.resolve('Sample README content');
                } else if (path === mockStudentFiles[0]) {
                    return Promise.resolve('def foo():\n    return 1');
                }
                return Promise.reject(new Error('File not found'));
            });

            const [nFailed, prompt] = await aiTutor.getPrompt(
                mockReportPaths,
                mockStudentFiles,
                mockReadmeFile,
                mockExplanationIn
            );

            expect(nFailed).toBe(1);
            expect(prompt).toContain('## Test Report Summary');
            expect(prompt).toContain('failed:longrepr:AssertionError: assert 1 == 2');
            expect(prompt).toContain('## Assignment Instructions');
            expect(prompt).toContain('Sample README content');
            expect(prompt).toContain('## Student Code');
            expect(prompt).toContain('# begin : code.py ======');
            expect(prompt).toContain('def foo():\n    return 1');
            expect(prompt).toContain('# end : code.py ======');
            expect(prompt).toContain('## End of Test Report');
            expect(prompt).toContain(aiTutor.loadLocale(mockExplanationIn)['directive']);
        });

        it('should construct the correct prompt without failed tests', async () => {
            const mockReportPaths = ['/path/to/report.json'];
            const mockStudentFiles = ['/path/to/code.py'];
            const mockReadmeFile = '/path/to/README.md';
            const mockExplanationIn = 'Korean';

            const mockReportData = { tests: [{ outcome: 'passed' }] };

            mockedFs.readFile.mockImplementation((path: string) => {
                if (path === mockReportPaths[0]) {
                    return Promise.resolve(JSON.stringify(mockReportData));
                } else if (path === mockReadmeFile) {
                    return Promise.resolve('Sample README content');
                } else if (path === mockStudentFiles[0]) {
                    return Promise.resolve('def foo():\n    return 1');
                }
                return Promise.reject(new Error('File not found'));
            });

            const [nFailed, prompt] = await aiTutor.getPrompt(
                mockReportPaths,
                mockStudentFiles,
                mockReadmeFile,
                mockExplanationIn
            );

            expect(nFailed).toBe(0);
            expect(prompt).not.toContain('## Test Report Summary');
            expect(prompt).not.toContain('## End of Test Report');
            expect(prompt).toContain('## Assignment Instructions');
            expect(prompt).toContain('Sample README content');
            expect(prompt).toContain('## Student Code');
            expect(prompt).toContain('# begin : code.py ======');
            expect(prompt).toContain('def foo():\n    return 1');
            expect(prompt).toContain('# end : code.py ======');
            expect(prompt).toContain('과제 지침'); // Korean locale string
        });
    });

    describe('collectLongreprFromMultipleReports', () => {
        it('should collect longrepr from multiple reports', async () => {
            const mockReportPaths = ['/path/to/report1.json', '/path/to/report2.json'];
            const mockExplanationIn = 'English';

            const mockReportData1 = {
                tests: [
                    {
                        outcome: 'failed',
                        nodeid: 'test_foo',
                        longrepr: { longrepr: 'AssertionError: assert 1 == 2' },
                    },
                ],
            };

            const mockReportData2 = {
                tests: [
                    {
                        outcome: 'failed',
                        nodeid: 'test_bar',
                        longrepr: { longrepr: 'AssertionError: assert 3 == 4' },
                    },
                ],
            };

            mockedFs.readFile.mockImplementation((path: string) => {
                if (path === mockReportPaths[0]) {
                    return Promise.resolve(JSON.stringify(mockReportData1));
                } else if (path === mockReportPaths[1]) {
                    return Promise.resolve(JSON.stringify(mockReportData2));
                }
                return Promise.reject(new Error('File not found'));
            });

            const longreprList = await aiTutor.collectLongreprFromMultipleReports(
                mockReportPaths,
                mockExplanationIn
            );

            expect(longreprList).toEqual([
                '## Test Report Summary',
                'failed:longrepr:AssertionError: assert 1 == 2',
                'failed:longrepr:AssertionError: assert 3 == 4',
                '## End of Test Report',
            ]);
        });
    });

    describe('collectLongrepr', () => {
        it('should collect longrepr from a single report', () => {
            const mockReportData = {
                tests: [
                    {
                        outcome: 'failed',
                        nodeid: 'test_foo',
                        longrepr: { longrepr: 'AssertionError: assert 1 == 2' },
                    },
                    {
                        outcome: 'passed',
                        nodeid: 'test_bar',
                    },
                ],
            };

            const longreprList = aiTutor.collectLongrepr(mockReportData);

            expect(longreprList).toEqual(['failed:longrepr:AssertionError: assert 1 == 2']);
        });
    });

    // Add more unit tests for other functions in ai_tutor.ts as needed
});
