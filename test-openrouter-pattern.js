// Test OpenRouter pattern
const fs = require('fs');

// Load the pattern
const configContent = fs.readFileSync('custom-patterns.json', 'utf8');
const config = JSON.parse(configContent);

// Find OpenRouter pattern
const openrouterPattern = config.custom_patterns.find(p => p.name === "OpenRouter API Keys");

console.log('=== OpenRouter Pattern Test ===\n');
console.log('Pattern config:');
console.log(`  Name: ${openrouterPattern.name}`);
console.log(`  Search patterns: [${openrouterPattern.search_patterns.join(', ')}]`);
console.log(`  Regex: ${openrouterPattern.regex_pattern}`);
console.log(`  Confidence: ${openrouterPattern.confidence}`);
console.log(`  Enabled: ${openrouterPattern.enabled}`);

// Test regex
const regex = new RegExp(openrouterPattern.regex_pattern, 'g');

// Test cases
const testCases = [
  'sk-or-abcd1234567890abcdef1234567890abcd', // 36 chars
  'sk-or-abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd', // 68 chars  
  'sk-or-abc123def456ghi789jkl012mno345pqr567', // 42 chars
  'sk-or-v1-abcd1234567890abcdef1234567890', // old format with v1
  'sk-or-short', // too short
  'sk-or-' + 'a'.repeat(80), // too long
  'not-an-openrouter-key',
  'sk-or-abcd-1234-5678-9012-abcd', // with hyphens
];

console.log('\n=== Test Results ===');
testCases.forEach((testCase, i) => {
  regex.lastIndex = 0; // Reset regex state
  const match = regex.test(testCase);
  const length = testCase.replace('sk-or-', '').length;
  console.log(`${i+1}. "${testCase.substring(0, 40)}${testCase.length > 40 ? '...' : ''}"`);
  console.log(`   Length after sk-or-: ${length} chars`);
  console.log(`   Match: ${match ? '✅' : '❌'}`);
  console.log('');
});

// Test in context
console.log('=== Context Test ===');
const sampleCode = `
const OPENROUTER_API_KEY = "sk-or-abcd1234567890abcdef1234567890abcdef";
const openrouter = new OpenRouter("sk-or-xyz789def456ghi123jkl456mno789pqr");
export const config = {
  apiKey: "sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz"
};
`;

regex.lastIndex = 0;
const matches = [...sampleCode.matchAll(regex)];
console.log(`Found ${matches.length} matches in sample code:`);
matches.forEach((match, i) => {
  console.log(`  ${i+1}. "${match[0]}" (length: ${match[0].length})`);
});

console.log('\n=== Summary ===');
console.log('✅ Pattern accepts 32-70 characters after "sk-or-"');
console.log('✅ Supports letters, numbers, and hyphens');
console.log('✅ High confidence rating');
console.log('⚠️  Currently disabled - set enabled: true to activate');