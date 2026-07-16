import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("redirects the primary route to the installable companion", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/companion/index.html");
});

test("ships a validated 3,000-question PMP library", () => {
  const source = fs.readFileSync(
    new URL("../public/companion/data/questions.js", import.meta.url),
    "utf8",
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const questions = sandbox.window.PMP_QUESTIONS;

  const tally = (field) =>
    questions.reduce((result, question) => {
      result[question[field]] = (result[question[field]] ?? 0) + 1;
      return result;
    }, {});

  assert.equal(questions.length, 3000);
  assert.equal(new Set(questions.map((question) => question.id)).size, 3000);
  assert.equal(new Set(questions.map((question) => question.question)).size, 3000);
  assert.deepEqual(tally("domain"), {
    People: 990,
    Process: 1230,
    "Business Environment": 780,
  });
  assert.deepEqual(tally("approach"), {
    Predictive: 1200,
    Agile: 900,
    Hybrid: 900,
  });
  assert.deepEqual(
    questions.reduce((result, question) => {
      const letter = "ABCD"[question.answer];
      result[letter] = (result[letter] ?? 0) + 1;
      return result;
    }, {}),
    { A: 750, B: 750, C: 750, D: 750 },
  );
  assert.ok(
    questions.every(
      (question) =>
        question.choices.length === 4 &&
        question.answer >= 0 &&
        question.answer <= 3 &&
        question.explanation &&
        question.lens &&
        question.task,
    ),
  );

  const canonicalAnswer = new Map();
  questions
    .filter((question) => question.variant === 1)
    .forEach((question) => canonicalAnswer.set(question.archetypeId, question.choices[question.answer]));
  assert.equal(canonicalAnswer.size, 100);
  assert.ok(
    questions.every(
      (question) => question.choices[question.answer] === canonicalAnswer.get(question.archetypeId),
    ),
  );
});
