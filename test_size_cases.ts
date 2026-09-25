import { extractCodeQtyPairsFromComment } from './src/utils/commentParser';

const testCases = [
  { input: '30L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '30L1XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 M1 L2', expected: [{ code: '30', qty: 3 }] },
  { input: '30 S1 M1 L1', expected: [{ code: '30', qty: 3 }] },
  { input: '30L2', expected: [{ code: '30', qty: 2 }] },
  { input: '30XL1', expected: [{ code: '30', qty: 1 }] },
  { input: '30M1', expected: [{ code: '30', qty: 1 }] },
  { input: '30S1', expected: [{ code: '30', qty: 1 }] },
  { input: '30 2XL1', expected: [{ code: '30', qty: 1 }] },
  { input: '30 3XL1', expected: [{ code: '30', qty: 1 }] },
  { input: '30 L 1 XL 1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 L=1 XL=1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 L1, XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 size L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '30 សាយ L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: 'យក 30L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: 'កាត់ 30 L1 XL1', expected: [{ code: '30', qty: 2 }] },
  { input: '40 3', expected: [{ code: '40', qty: 3 }] },
  { input: '94 ចង្កះ36', expected: [{ code: '94', qty: 1 }] },
  { input: '94=2 ចង្កេះ34', expected: [{ code: '94', qty: 2 }] },
  { input: '125=1', expected: [{ code: '125', qty: 1 }] },
  { input: '145យក10ប្រសូត010751525', expected: [{ code: '145', qty: 10 }] }
];

console.log('Running test cases:');
for (const tc of testCases) {
  const res = extractCodeQtyPairsFromComment(tc.input);
  console.log(`Input: "${tc.input}" => Result:`, JSON.stringify(res));
}
