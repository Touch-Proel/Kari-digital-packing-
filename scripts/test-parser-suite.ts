import { extractCodeQtyPairsFromComment, extractSizeAndColorNotes } from '../src/utils/commentParser';

interface TestCase {
  name: string;
  comment: string;
  expectedCodes: { code: string; qty: number }[];
  expectedNotes?: string[];
  forbiddenCodes?: string[];
}

const mockCatalog = [
  { code: '1' },
  { code: '2' },
  { code: '3' },
  { code: '6' },
  { code: '12' },
  { code: '13' },
  { code: '19' },
  { code: '20' },
  { code: '27' },
  { code: '28' },
  { code: '29' },
  { code: '30' },
  { code: '31' },
  { code: '32' },
  { code: '33' },
  { code: '34' },
  { code: '35' },
  { code: '36' },
  { code: '38' },
  { code: '40' },
  { code: '50' },
  { code: '51' },
  { code: '53' },
  { code: '54' },
  { code: '65' },
  { code: '68' },
  { code: '71' },
  { code: '73' },
  { code: '74' },
  { code: '76' },
  { code: '77' },
  { code: '82' },
  { code: '87' },
  { code: '92' },
  { code: '94' },
  { code: '96' },
  { code: '99' },
  { code: '102' },
  { code: '108' },
  { code: '110' },
  { code: '117' },
  { code: '121' },
  { code: '124' },
  { code: '127' },
  { code: '137' },
  { code: '157' },
  { code: '161' },
  { code: 'B11' },
  { code: '2004' }
];

const testCases: TestCase[] = [
  // 1. Weight variations & Typos
  {
    name: 'Weight with គឺឡូ attached to code and qty',
    comment: '73=1គឺឡូ68',
    expectedCodes: [{ code: '73', qty: 1 }],
    forbiddenCodes: ['68'],
    expectedNotes: ['68kg']
  },
  {
    name: 'Weight with គឺឡូ on second code',
    comment: '76=1គឺឡូ68',
    expectedCodes: [{ code: '76', qty: 1 }],
    forbiddenCodes: ['68'],
    expectedNotes: ['68kg']
  },
  {
    name: 'Weight with គីឡូ separated',
    comment: '82=1 គីឡូ68',
    expectedCodes: [{ code: '82', qty: 1 }],
    forbiddenCodes: ['68'],
    expectedNotes: ['68kg']
  },
  {
    name: 'Glued code and weight with color',
    comment: '157គីឡូ 65 ពណ៌ខ្មៅ',
    expectedCodes: [{ code: '157', qty: 1 }],
    forbiddenCodes: ['65'],
    expectedNotes: ['65kg', 'ពណ៌ខ្មៅ']
  },
  {
    name: 'Weight attached directly to equal sign (30=80kg)',
    comment: '30=80kg',
    expectedCodes: [{ code: '30', qty: 1 }],
    forbiddenCodes: ['80'],
    expectedNotes: ['80kg']
  },
  {
    name: 'Weight typo គឺទូ in Khmer digits (២៧=១គឺទូ៥៦)',
    comment: '២៧=១គឺទូ៥៦',
    expectedCodes: [{ code: '27', qty: 1 }],
    forbiddenCodes: ['56'],
    expectedNotes: ['56kg']
  },
  {
    name: 'Weight typo gk (77 gk65)',
    comment: '77 gk65',
    expectedCodes: [{ code: '77', qty: 1 }],
    forbiddenCodes: ['65'],
    expectedNotes: ['65kg']
  },
  {
    name: 'Weight shorthand គ65 (127គ65)',
    comment: '127គ65',
    expectedCodes: [{ code: '127', qty: 1 }],
    forbiddenCodes: ['65'],
    expectedNotes: ['65kg']
  },
  {
    name: 'Glued code and kg with qty (137kg70=1)',
    comment: '137kg70=1',
    expectedCodes: [{ code: '137', qty: 1 }],
    forbiddenCodes: ['70'],
    expectedNotes: ['70kg']
  },
  {
    name: 'Glued code and Kg (124Kg40)',
    comment: '124Kg40',
    expectedCodes: [{ code: '124', qty: 1 }],
    forbiddenCodes: ['40'],
    expectedNotes: ['40kg']
  },
  {
    name: 'Khmer numerals with weight (យក១៦១.១គីឡូ៥៤)',
    comment: 'យក១៦១.១គីឡូ៥៤',
    expectedCodes: [{ code: '161', qty: 1 }],
    forbiddenCodes: ['54'],
    expectedNotes: ['54kg']
  },

  // 2. Multi-product chained orders in single comments
  {
    name: 'Chained orders with guillemet (92»1»99»1»102»1)',
    comment: '92»1»99»1»102»1',
    expectedCodes: [
      { code: '92', qty: 1 },
      { code: '99', qty: 1 },
      { code: '102', qty: 1 }
    ]
  },
  {
    name: 'Chained orders with dash separator (12យក1-13យក1)',
    comment: '12យក1-13យក1',
    expectedCodes: [
      { code: '12', qty: 1 },
      { code: '13', qty: 1 }
    ]
  },
  {
    name: 'Chained orders with plus separator (74.1+77 1)',
    comment: '74.1+77 1',
    expectedCodes: [
      { code: '74', qty: 1 },
      { code: '77', qty: 1 }
    ]
  },
  {
    name: 'Chained orders with newline (76=10\n78=20)',
    comment: '76=10\n78=20',
    expectedCodes: [
      { code: '76', qty: 10 },
      { code: '78', qty: 20 }
    ]
  },

  // 3. Price & Dollar tags
  {
    name: 'Price tag with decimal (ថែម 74-1=2.50)',
    comment: 'ថែម 74-1=2.50',
    expectedCodes: [{ code: '74', qty: 1 }],
    forbiddenCodes: ['50', '2']
  },
  {
    name: 'Price tag with dollar sign (110 យក1 =2.5$)',
    comment: '110 យក1 =2.5$',
    expectedCodes: [{ code: '110', qty: 1 }],
    forbiddenCodes: ['5', '2']
  },
  {
    name: 'Price tag inside comment (53=3$យកពី)',
    comment: '53=3$យកពី',
    expectedCodes: [{ code: '53', qty: 2 }],
    forbiddenCodes: ['3']
  },

  // 4. Address & Street disambiguation
  {
    name: 'Street 2004 protection (078474059ផ្លូវ2004 102=1)',
    comment: '078474059ផ្លូវ2004 102=1',
    expectedCodes: [{ code: '102', qty: 1 }],
    forbiddenCodes: ['2004']
  },
  {
    name: 'Street 2004 with Khmer numerals (២០យក៣០៨៨៦៤០២៤១១ផ្លូវ 2004)',
    comment: '២០យក៣០៨៨៦៤០២៤១១ផ្លូវ 2004',
    expectedCodes: [{ code: '20', qty: 3 }],
    forbiddenCodes: ['2004']
  },
  {
    name: 'Project and street in address ((កូត110=3)093716863 កប់ស្រូវ​សង្កាត់​ស្នោ​បុរី​ម៉នដានី​គំរោង​19​ផ្លូវទី​2​ផ្ទះលេខ​C13​)',
    comment: '(កូត110=3)093716863 កប់ស្រូវ​សង្កាត់​ស្នោ​បុរី​ម៉នដានី​គំរោង​19​ផ្លូវទី​2​ផ្ទះលេខ​C13​',
    expectedCodes: [{ code: '110', qty: 3 }],
    forbiddenCodes: ['19', '2', '13']
  },

  // 5. Waist and Pants sizes
  {
    name: 'Multi-waist list on jeans (87Size29, 30,31,32)',
    comment: '87Size29, 30,31,32',
    expectedCodes: [{ code: '87', qty: 4 }],
    forbiddenCodes: ['30', '31', '32']
  },
  {
    name: 'Code with waist specification (94=2 ចង្កេះ34)',
    comment: '94=2 ចង្កេះ34',
    expectedCodes: [{ code: '94', qty: 2 }],
    forbiddenCodes: ['34']
  },
  {
    name: 'Combined size list (3=3SmL)',
    comment: '3=3SmL',
    expectedCodes: [{ code: '3', qty: 3 }]
  },

  // 6. Inquiries and Chatter (MUST BE EMPTY)
  {
    name: 'Weight question (38ពាក់ដល់មាណគីឡូបង)',
    comment: '38ពាក់ដល់មាណគីឡូបង',
    expectedCodes: []
  },
  {
    name: 'Weight inquiry (117មានម៉ានគីឡូបង)',
    comment: '117មានម៉ានគីឡូបង',
    expectedCodes: []
  },
  {
    name: 'Wear question (ខោគីឡូ ៦៧ ស្លៀកបានទេអូន)',
    comment: 'ខោគីឡូ ៦៧ ស្លៀកបានទេអូន',
    expectedCodes: []
  },
  {
    name: 'Previous order confirmation check (ចែ 110 មិញបានអត់)',
    comment: 'ចែ 110 មិញបានអត់',
    expectedCodes: []
  },
  {
    name: 'Host outfit question (លើខ្លួនមួយឆុតបង)',
    comment: 'លើខ្លួនមួយឆុតបង',
    expectedCodes: []
  },
  {
    name: 'Chat comment (កុងកុំឮងមើល)',
    comment: 'កុងកុំឮងមើល',
    expectedCodes: []
  },
  {
    name: 'Pure action quantity without code (យក 2)',
    comment: 'យក 2',
    expectedCodes: []
  },
  {
    name: 'Leading code with address/phone in between and trailing quantity (58នៅជិតផ្សារបែកចាន*********យក20អាវ)',
    comment: '58នៅជិតផ្សារបែកចាន*********យក20អាវ',
    expectedCodes: [{ code: '58', qty: 20 }],
    forbiddenCodes: ['20']
  },
  {
    name: 'Leading code in Khmer digits with address and trailing quantity (៥៨នៅជិតផ្សារបែកចាន*********យក២០អាវ)',
    comment: '៥៨នៅជិតផ្សារបែកចាន*********យក២០អាវ',
    expectedCodes: [{ code: '58', qty: 20 }],
    forbiddenCodes: ['20']
  },
  {
    name: 'Verb prefix without quantity (ថែម39)',
    comment: 'ថែម39',
    expectedCodes: [{ code: '39', qty: 1 }]
  },
  {
    name: 'Verb prefix in Khmer digits without quantity (ថែម២១)',
    comment: 'ថែម២១',
    expectedCodes: [{ code: '21', qty: 1 }]
  },
  {
    name: 'Verb យក before 2-digit code without quantity (យក36)',
    comment: 'យក36',
    expectedCodes: [{ code: '36', qty: 1 }]
  },
  {
    name: 'Dot separated two codes (៥៨.៥៦)',
    comment: '៥៨.៥៦',
    expectedCodes: [{ code: '58', qty: 1 }, { code: '56', qty: 1 }]
  },
  {
    name: 'Slash separated two codes (63/17)',
    comment: '63/17',
    expectedCodes: [{ code: '63', qty: 1 }, { code: '17', qty: 1 }]
  },
  {
    name: 'Chained equals order (យក33=1=34=2=78=1=97=1=150=1)',
    comment: 'យក33=1=34=2=78=1=97=1=150=1',
    expectedCodes: [
      { code: '33', qty: 1 },
      { code: '34', qty: 2 },
      { code: '78', qty: 1 },
      { code: '97', qty: 1 },
      { code: '150', qty: 1 }
    ]
  },
  {
    name: 'Action verb with single-digit code (៦យក៣)',
    comment: '៦យក៣',
    expectedCodes: [{ code: '6', qty: 3 }]
  },
  {
    name: 'Colon with action verb (63:ថែម1)',
    comment: '63:ថែម1',
    expectedCodes: [{ code: '63', qty: 1 }]
  },
  {
    name: 'Typo verb យម before code (យម106)',
    comment: 'យម106',
    expectedCodes: [{ code: '106', qty: 1 }]
  },
  {
    name: 'QTY Guard for shorthand weight (30=80)',
    comment: '30=80',
    expectedCodes: [{ code: '30', qty: 1 }]
  },
  {
    name: 'QTY Guard for shorthand waist size (94=34)',
    comment: '94=34',
    expectedCodes: [{ code: '94', qty: 1 }]
  },
  {
    name: 'QTY Guard for max retail boundary <= 20 (58=20)',
    comment: '58=20',
    expectedCodes: [{ code: '58', qty: 20 }]
  },
  {
    name: 'QTY Guard for explicit wholesale unit word (58=50 អាវ)',
    comment: '58=50 អាវ',
    expectedCodes: [{ code: '58', qty: 50 }]
  },
  {
    name: 'QTY Guard clamp for bare naked number > 20 (12=55)',
    comment: '12=55',
    expectedCodes: [{ code: '12', qty: 1 }]
  }
];

let totalPassed = 0;
let totalFailed = 0;

console.log('====================================================');
console.log('🚀 RUNNING ADVANCED 99.99% COMMENT PARSER TEST SUITE');
console.log('====================================================\n');

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const result = extractCodeQtyPairsFromComment(tc.comment, mockCatalog, false);
  const notes = extractSizeAndColorNotes(tc.comment);

  let passed = true;
  const failureReasons: string[] = [];

  // Check expected codes
  if (tc.expectedCodes.length !== result.length) {
    passed = false;
    failureReasons.push(
      `Expected ${tc.expectedCodes.length} item(s) but got ${result.length}: ${JSON.stringify(result)}`
    );
  } else {
    for (const exp of tc.expectedCodes) {
      const match = result.find(r => r.code === exp.code);
      if (!match) {
        passed = false;
        failureReasons.push(`Missing expected code: ${exp.code}`);
      } else if (match.qty !== exp.qty) {
        passed = false;
        failureReasons.push(`Code ${exp.code} expected qty ${exp.qty} but got ${match.qty}`);
      }
    }
  }

  // Check forbidden codes
  if (tc.forbiddenCodes) {
    for (const f of tc.forbiddenCodes) {
      if (result.some(r => r.code === f)) {
        passed = false;
        failureReasons.push(`Falsely extracted forbidden code: ${f}`);
      }
    }
  }

  // Check expected notes
  if (tc.expectedNotes) {
    for (const en of tc.expectedNotes) {
      if (!notes.includes(en)) {
        passed = false;
        failureReasons.push(`Notes missing expected: "${en}". Actual notes: "${notes}"`);
      }
    }
  }

  if (passed) {
    totalPassed++;
    console.log(`✅ [PASS] #${i + 1}: ${tc.name}`);
    console.log(`   Input: "${tc.comment}" => Extracted: ${JSON.stringify(result)} | Notes: "${notes}"\n`);
  } else {
    totalFailed++;
    console.log(`❌ [FAIL] #${i + 1}: ${tc.name}`);
    console.log(`   Input: "${tc.comment}"`);
    console.log(`   Extracted: ${JSON.stringify(result)}`);
    console.log(`   Notes: "${notes}"`);
    console.log(`   Reasons:\n   - ${failureReasons.join('\n   - ')}\n`);
  }
}

console.log('====================================================');
console.log(`📊 SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('====================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL TESTS PASSED WITH 100% SUCCESS RATE!');
  process.exit(0);
}
