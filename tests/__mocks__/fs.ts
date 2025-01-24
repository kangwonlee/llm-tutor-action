// tests/__mocks__/fs.ts
import * as path from 'path';
export const promises = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
};

export const existsSync = jest.fn();
export const statSync = jest.fn().mockImplementation((path: string) => {
    return {
        isDirectory: () => false,
        isFile: () => true,
    };
});
export const readFileSync = jest.fn();
export default { promises, existsSync, statSync, readFileSync };
