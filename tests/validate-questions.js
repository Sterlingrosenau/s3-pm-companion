const fs = require("fs");
const vm = require("vm");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("data/questions.js", "utf8"), sandbox);

const questions = sandbox.window.PMP_QUESTIONS;
const expectedDomains = { People: 33, Process: 41, "Business Environment": 26 };
const expectedApproaches = { Predictive: 40, Agile: 30, Hybrid: 30 };
const expectedAnswers = { A: 25, B: 25, C: 25, D: 25 };

function tally(field) {
  return questions.reduce((result, question) => {
    const key = question[field];
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + " mismatch: " + JSON.stringify(actual));
  }
}

if (questions.length !== 100) throw new Error("Expected 100 questions; found " + questions.length);
if (new Set(questions.map((question) => question.id)).size !== 100) throw new Error("Question IDs must be unique");
if (questions.some((question) => question.choices.length !== 4 || question.answer < 0 || question.answer > 3)) throw new Error("Each question must have four choices and one valid answer");
if (questions.some((question) => !question.question || !question.explanation || !question.lens || !question.task)) throw new Error("Question content or explanation field is missing");

equal(tally("domain"), expectedDomains, "Domain distribution");
equal(tally("approach"), expectedApproaches, "Approach distribution");
equal(questions.reduce((result, question) => {
  const key = "ABCD"[question.answer];
  result[key] = (result[key] || 0) + 1;
  return result;
}, {}), expectedAnswers, "Answer distribution");

console.log("Validated 100 questions: blueprint, approach mix, answer balance, IDs, choices, and explanations all pass.");
