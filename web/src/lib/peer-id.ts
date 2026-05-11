import { customAlphabet } from 'nanoid';

export const generatePeerId = customAlphabet('0123456789abcdef', 8);
