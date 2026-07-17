(function () {
  "use strict";

  var STORAGE_KEY = "s3-pmp-companion-v4-800";
  var QUESTIONS = window.PMP_QUESTIONS || [];
  var deferredInstallPrompt = null;
  var quiz = { questions: [], index: 0, results: [], answeredCurrent: false };
  var defaultState = {
    settings: { examDate: "2026-08-31", weekdayMinutes: 35, longMinutes: 75 },
    answers: {},
    history: [],
    flags: [],
    completedSessions: {},
    logs: []
  };
  var state = loadState();

  function byId(id) { return document.getElementById(id); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function todayKey() { return localDateKey(new Date()); }
  function localDateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }
  function parseLocalDate(value) {
    var parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed) return JSON.parse(JSON.stringify(defaultState));
      return {
        settings: Object.assign({}, defaultState.settings, parsed.settings || {}),
        answers: parsed.answers || {},
        history: parsed.history || [],
        flags: parsed.flags || [],
        completedSessions: parsed.completedSessions || {},
        logs: parsed.logs || []
      };
    } catch {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    refreshAll();
  }
  function toast(message) {
    var element = byId("toast");
    element.textContent = message;
    element.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { element.classList.remove("show"); }, 2400);
  }
  function percent(numerator, denominator) { return denominator ? Math.round((numerator / denominator) * 100) : 0; }
  function formatDate(date, options) { return new Intl.DateTimeFormat("en-US", options || { month: "short", day: "numeric" }).format(date); }
  function formatMinutes(minutes) {
    if (minutes < 60) return minutes + " min";
    var hours = Math.floor(minutes / 60);
    var remain = minutes % 60;
    return hours + "h" + (remain ? " " + remain + "m" : "");
  }

  function buildSchedule() {
    var start = new Date();
    start.setHours(12, 0, 0, 0);
    var exam = parseLocalDate(state.settings.examDate);
    var end = new Date(exam);
    end.setDate(end.getDate() - 1);
    if (end < start) return [];
    var dates = [];
    var cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getDay() !== 0) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    var total = dates.length || 1;
    return dates.map(function (date, index) {
      var ratio = index / total;
      var day = date.getDay();
      var isLong = day === 6;
      var focus;
      var activity;
      var description;
      var filter = { domain: "all", approach: "all", set: "unanswered" };
      if (index === 0) {
        focus = "Baseline diagnostic";
        activity = "10-question mixed set";
        description = "Establish your starting accuracy across all three domains.";
      } else if (ratio < .18) {
        focus = "People: alignment and leadership";
        activity = isLong ? "25-question People deep dive" : "People scenarios + review";
        description = "Practice conflict, stakeholder expectations, team performance, and communication decisions.";
        filter.domain = "People";
      } else if (ratio < .40) {
        focus = "Process: delivery discipline";
        activity = isLong ? "25-question Process deep dive" : "Process scenarios + formulas";
        description = "Work scope, schedule, quality, risk, procurement, and integrated change decisions.";
        filter.domain = "Process";
      } else if (ratio < .58) {
        focus = "Business Environment: value";
        activity = isLong ? "25-question business-impact set" : "Value and governance scenarios";
        description = "Connect compliance, benefits, change, sustainability, and strategy to project choices.";
        filter.domain = "Business Environment";
      } else if (ratio < .72) {
        focus = "Adaptive and hybrid judgment";
        activity = isLong ? "25-question adaptive/hybrid set" : "Agile and hybrid scenarios";
        description = "Choose the right action when governance, feedback, and delivery cadence intersect.";
        filter.approach = day % 2 ? "Agile" : "Hybrid";
      } else if (ratio < .86) {
        focus = "Weak-area correction";
        activity = isLong ? "50-question timed simulation" : "Missed-question recovery";
        description = "Rework errors, explain the decision rule, and close your lowest-scoring gap.";
        filter.set = "missed";
      } else if (ratio < .96) {
        focus = "Exam simulation and pacing";
        activity = isLong ? "180-question external mock" : "25-question timed mixed set";
        description = "Practice 80 seconds per question, review flags, and build concentration.";
      } else {
        focus = "Final review and confidence";
        activity = "Light review only";
        description = "Review decision patterns and formulas; stop heavy study the day before the exam.";
      }
      var daysUntilExam = Math.round((exam - date) / 86400000);
      if (isLong && daysUntilExam >= 7 && daysUntilExam <= 14) {
        focus = "Full exam simulation";
        activity = "180-question timed mock";
        description = "Use a full-length mock, follow the two-break structure, then analyze every miss and pacing decision.";
        filter = { domain: "all", approach: "all", set: "all" };
      }
      return {
        id: localDateKey(date),
        date: date,
        focus: focus,
        activity: activity,
        description: description,
        minutes: isLong ? Number(state.settings.longMinutes) : Number(state.settings.weekdayMinutes),
        filter: filter
      };
    });
  }

  function scheduleMetrics() {
    var schedule = buildSchedule();
    var complete = schedule.filter(function (session) { return state.completedSessions[session.id]; }).length;
    return { total: schedule.length, complete: complete, percent: percent(complete, schedule.length) };
  }
  function answerMetrics() {
    var answeredIds = Object.keys(state.answers);
    var correct = answeredIds.filter(function (id) { return state.answers[id].correct; }).length;
    var recent = state.history.slice(-30);
    var recentCorrect = recent.filter(function (item) { return item.correct; }).length;
    return {
      answered: answeredIds.length,
      correct: correct,
      accuracy: percent(correct, answeredIds.length),
      recentAccuracy: percent(recentCorrect, recent.length),
      recentCount: recent.length,
      coverage: percent(answeredIds.length, QUESTIONS.length),
      readinessCoverage: clamp(percent(answeredIds.length, Math.min(700, QUESTIONS.length)), 0, 100)
    };
  }
  function readiness() {
    var answers = answerMetrics();
    var plan = scheduleMetrics();
    return Math.round((answers.recentAccuracy * .60) + (answers.readinessCoverage * .25) + (plan.percent * .15));
  }
  function totalMinutes() {
    var logs = state.logs.reduce(function (sum, item) { return sum + Number(item.minutes || 0); }, 0);
    var schedule = buildSchedule();
    var planned = schedule.reduce(function (sum, session) { return sum + (state.completedSessions[session.id] ? session.minutes : 0); }, 0);
    return logs + planned;
  }
  function streak() {
    var active = {};
    state.history.forEach(function (item) { active[item.date.slice(0, 10)] = true; });
    state.logs.forEach(function (item) { active[item.date.slice(0, 10)] = true; });
    Object.keys(state.completedSessions).forEach(function (key) { if (state.completedSessions[key]) active[key] = true; });
    var count = 0;
    var cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!active[localDateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (active[localDateKey(cursor)]) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function groupMetrics(field, labels) {
    return labels.map(function (label) {
      var matching = QUESTIONS.filter(function (question) { return question[field] === label; });
      var answered = matching.filter(function (question) { return state.answers[question.id]; });
      var correct = answered.filter(function (question) { return state.answers[question.id].correct; });
      return { label: label, total: matching.length, answered: answered.length, correct: correct.length, accuracy: percent(correct.length, answered.length) };
    });
  }
  function renderMetrics(container, metrics, emptyText) {
    container.innerHTML = "";
    metrics.forEach(function (metric) {
      var row = document.createElement("div");
      row.className = "metric-row";
      var label = document.createElement("div");
      label.className = "metric-label";
      var title = document.createElement("strong");
      title.textContent = metric.label;
      var note = document.createElement("small");
      note.textContent = metric.answered ? metric.correct + " correct of " + metric.answered + " answered" : emptyText;
      label.appendChild(title);
      label.appendChild(note);
      var meter = document.createElement("div");
      meter.className = "meter";
      var fill = document.createElement("span");
      fill.style.width = metric.accuracy + "%";
      meter.appendChild(fill);
      var value = document.createElement("div");
      value.className = "metric-value";
      value.textContent = metric.answered ? metric.accuracy + "%" : "—";
      row.appendChild(label);
      row.appendChild(meter);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  function updateDashboard() {
    var now = new Date();
    var hour = now.getHours();
    byId("daypart").textContent = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    var exam = parseLocalDate(state.settings.examDate);
    var days = Math.ceil((exam - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    byId("countdownCopy").textContent = days > 0 ? days + " days until your " + formatDate(exam, { month: "long", day: "numeric" }) + " exam." : days === 0 ? "Exam day is here. Trust your preparation." : "Update your exam date to rebuild the plan.";
    var ready = readiness();
    byId("readinessValue").textContent = ready + "%";
    byId("readinessRing").style.background = "conic-gradient(var(--gold) " + (ready * 3.6) + "deg, rgba(255,255,255,.12) 0)";
    byId("readinessRing").setAttribute("aria-label", "Study readiness estimate " + ready + " percent");
    var answers = answerMetrics();
    byId("answeredStat").textContent = answers.answered + " / " + QUESTIONS.length;
    byId("coverageStat").textContent = answers.coverage + "% coverage";
    byId("accuracyStat").textContent = answers.answered ? answers.accuracy + "%" : "—";
    byId("recentAccuracyStat").textContent = answers.recentCount ? answers.recentAccuracy + "% across last " + answers.recentCount : "No answers yet";
    byId("minutesStat").textContent = formatMinutes(totalMinutes());
    byId("sessionStat").textContent = (state.logs.length + scheduleMetrics().complete) + " sessions logged";
    byId("streakStat").textContent = streak() + (streak() === 1 ? " day" : " days");
    renderMetrics(byId("domainPulse"), groupMetrics("domain", ["People", "Process", "Business Environment"]), "Not started");

    var schedule = buildSchedule();
    var today = schedule.find(function (session) { return session.id === todayKey(); }) || schedule[0];
    if (today) {
      byId("todayTitle").textContent = today.focus;
      byId("todayDescription").textContent = today.activity + ". " + today.description;
      byId("todayMinutes").textContent = today.minutes + " min";
      byId("completeTodayButton").textContent = state.completedSessions[today.id] ? "Completed ✓" : "Mark complete";
      byId("completeTodayButton").dataset.sessionId = today.id;
      byId("startTodayButton").dataset.sessionId = today.id;
    } else {
      byId("todayTitle").textContent = "Update your exam date";
      byId("todayDescription").textContent = "Choose an upcoming date to generate the daily schedule.";
      byId("todayMinutes").textContent = "—";
    }
    updateRecommendation();
  }

  function updateRecommendation() {
    var answers = answerMetrics();
    var title = "Take a 10-question diagnostic";
    var copy = "A mixed set gives the tracker enough information to tailor your review.";
    var action = function () { startQuickQuiz({ set: "unanswered", domain: "all", approach: "all" }, 10); };
    if (answers.answered >= 10) {
      var domains = groupMetrics("domain", ["People", "Process", "Business Environment"]).filter(function (item) { return item.answered; }).sort(function (a, b) { return a.accuracy - b.accuracy; });
      var weak = domains[0];
      if (weak && weak.accuracy < 75) {
        title = "Strengthen " + weak.label;
        copy = weak.accuracy + "% accuracy is your lowest measured domain. Work a focused 10-question set.";
        action = function () { startQuickQuiz({ set: "unanswered", domain: weak.label, approach: "all" }, 10); };
      } else {
        var missed = Object.keys(state.answers).filter(function (id) { return !state.answers[id].correct; }).length;
        if (missed) {
          title = "Recover " + missed + " missed question" + (missed === 1 ? "" : "s");
          copy = "Explain the decision rule before choosing again; do not memorize the option letter.";
          action = function () { startQuickQuiz({ set: "missed", domain: "all", approach: "all" }, Math.min(10, missed)); };
        } else {
          title = "Build exam stamina";
          copy = "Your latest answers are strong. Increase the set size and hold an 80-second pace.";
          action = function () { startQuickQuiz({ set: "unanswered", domain: "all", approach: "all" }, 25); };
        }
      }
    }
    byId("recommendationTitle").textContent = title;
    byId("recommendationCopy").textContent = copy;
    byId("recommendationButton").onclick = action;
  }

  function updatePlan() {
    byId("examDateInput").value = state.settings.examDate;
    byId("weekdayMinutesInput").value = String(state.settings.weekdayMinutes);
    byId("longMinutesInput").value = String(state.settings.longMinutes);
    var schedule = buildSchedule();
    var plan = scheduleMetrics();
    var totalMinutesPlanned = schedule.reduce(function (sum, session) { return sum + session.minutes; }, 0);
    byId("planSummary").innerHTML = "<div class='summary-chip'><strong>" + schedule.length + "</strong><span>focused sessions remaining</span></div><div class='summary-chip'><strong>" + formatMinutes(totalMinutesPlanned) + "</strong><span>planned study time</span></div><div class='summary-chip'><strong>" + plan.percent + "%</strong><span>current plan completion</span></div>";
    var list = byId("scheduleList");
    list.innerHTML = "";
    if (!schedule.length) {
      list.innerHTML = "<article class='panel'><h2>No future sessions</h2><p>Choose an upcoming exam date to regenerate the plan.</p></article>";
      return;
    }
    var weeks = {};
    schedule.forEach(function (session) {
      var weekStart = new Date(session.date);
      var day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
      var key = localDateKey(weekStart);
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(session);
    });
    Object.keys(weeks).forEach(function (key, weekIndex) {
      var sessions = weeks[key];
      var completed = sessions.filter(function (session) { return state.completedSessions[session.id]; }).length;
      var card = document.createElement("article");
      card.className = "week-card";
      var header = document.createElement("div");
      header.className = "week-header";
      header.innerHTML = "<div><h2>Week " + (weekIndex + 1) + ": " + sessions[0].focus.split(":")[0] + "</h2><p>" + formatDate(sessions[0].date) + " – " + formatDate(sessions[sessions.length - 1].date) + "</p></div><div class='week-score'>" + completed + "/" + sessions.length + "</div>";
      var sessionList = document.createElement("div");
      sessionList.className = "session-list";
      sessions.forEach(function (session) {
        var row = document.createElement("div");
        row.className = "session-row" + (state.completedSessions[session.id] ? " complete" : "") + (session.id === todayKey() ? " today" : "");
        row.innerHTML = "<div class='session-date'><strong>" + formatDate(session.date, { weekday: "short" }) + "</strong><span>" + formatDate(session.date) + "</span></div><div class='session-copy'><strong>" + session.activity + "</strong><span>" + session.description + " · " + session.minutes + " min</span></div>";
        var button = document.createElement("button");
        button.type = "button";
        button.className = "check-button";
        button.setAttribute("aria-label", (state.completedSessions[session.id] ? "Mark incomplete: " : "Mark complete: ") + session.activity);
        button.textContent = state.completedSessions[session.id] ? "✓" : "";
        button.addEventListener("click", function () { toggleSession(session.id); });
        row.appendChild(button);
        sessionList.appendChild(row);
      });
      card.appendChild(header);
      card.appendChild(sessionList);
      list.appendChild(card);
    });
  }

  function toggleSession(id) {
    state.completedSessions[id] = !state.completedSessions[id];
    saveState();
    toast(state.completedSessions[id] ? "Study session completed." : "Session marked incomplete.");
  }

  function getQuestionPool(criteria) {
    var pool = QUESTIONS.slice();
    if (criteria.domain && criteria.domain !== "all") pool = pool.filter(function (q) { return q.domain === criteria.domain; });
    if (criteria.approach && criteria.approach !== "all") pool = pool.filter(function (q) { return q.approach === criteria.approach; });
    if (criteria.format && criteria.format !== "all") pool = pool.filter(function (q) { return q.type === criteria.format; });
    if (criteria.set === "unanswered") {
      var unanswered = pool.filter(function (q) { return !state.answers[q.id]; });
      var missed = pool.filter(function (q) { return state.answers[q.id] && !state.answers[q.id].correct; });
      var mastered = pool.filter(function (q) { return state.answers[q.id] && state.answers[q.id].correct; });
      pool = unanswered.concat(missed, mastered);
    } else if (criteria.set === "missed") {
      pool = pool.filter(function (q) { return state.answers[q.id] && !state.answers[q.id].correct; });
    } else if (criteria.set === "flagged") {
      pool = pool.filter(function (q) { return state.flags.indexOf(q.id) !== -1; });
    }
    return pool;
  }
  function deterministicMix(items) {
    return items.slice().sort(function (a, b) {
      var aScore = (((a.id * 2654435761) ^ (state.history.length * 2246822519)) >>> 0);
      var bScore = (((b.id * 2654435761) ^ (state.history.length * 2246822519)) >>> 0);
      return aScore - bScore;
    });
  }
  function diversifyArchetypes(items) {
    var buckets = {};
    var order = [];
    items.forEach(function (question) {
      var key = String(question.archetypeId || question.id);
      if (!buckets[key]) { buckets[key] = []; order.push(key); }
      buckets[key].push(question);
    });
    var diversified = [];
    var remaining = true;
    while (remaining) {
      remaining = false;
      order.forEach(function (key) {
        if (buckets[key].length) {
          diversified.push(buckets[key].shift());
          remaining = true;
        }
      });
    }
    return diversified;
  }
  function selectPracticeQuestions(criteria, size) {
    var allCriteria = { set: "all", domain: criteria.domain, approach: criteria.approach, format: criteria.format };
    var all = getQuestionPool(allCriteria);
    var tiers;
    if (criteria.set === "unanswered") {
      tiers = [
        all.filter(function (q) { return !state.answers[q.id]; }),
        all.filter(function (q) { return state.answers[q.id] && !state.answers[q.id].correct; }),
        all.filter(function (q) { return state.answers[q.id] && state.answers[q.id].correct; })
      ];
    } else {
      tiers = [getQuestionPool(criteria)];
    }
    var selected = [];
    var selectedIds = {};
    tiers.forEach(function (tier) {
      diversifyArchetypes(deterministicMix(tier)).forEach(function (question) {
        if (selected.length < size && !selectedIds[question.id]) {
          selected.push(question);
          selectedIds[question.id] = true;
        }
      });
    });
    return selected;
  }
  function startQuickQuiz(criteria, size) {
    showView("practice");
    var selected = selectPracticeQuestions(criteria, size);
    if (!selected.length && criteria.set !== "all") {
      criteria.set = "all";
      selected = selectPracticeQuestions(criteria, size);
    }
    beginQuiz(selected);
  }
  function beginQuiz(questions) {
    if (!questions.length) {
      toast("No questions match those filters yet.");
      return;
    }
    quiz = { questions: questions, index: 0, results: [], answeredCurrent: false };
    byId("quizBuilder").hidden = true;
    byId("quizResults").hidden = true;
    byId("questionCard").hidden = false;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function questionInstruction(question) {
    if (question.type === "multiple") return "Select exactly " + question.selectCount + " responses.";
    if (question.type === "sequence") return "Assign each step a unique position from 1 (first) to " + question.choices.length + " (last).";
    if (question.type === "case") return "Use both the scenario and decision record to choose the best response.";
    if (question.type === "graphic") return "Interpret the signal panel before choosing the best response.";
    return "Choose the single best response.";
  }

  function renderExhibit(question) {
    var container = byId("questionExhibit");
    var content = byId("exhibitContent");
    container.hidden = !question.exhibit;
    content.innerHTML = "";
    if (!question.exhibit) return;
    byId("exhibitTitle").textContent = question.exhibit.title;
    if (question.exhibit.type === "status") {
      var panel = document.createElement("div");
      panel.className = "status-panel";
      question.exhibit.rows.forEach(function (row) {
        var item = document.createElement("div");
        item.className = "status-row";
        var label = document.createElement("strong");
        label.textContent = row[0];
        var track = document.createElement("div");
        track.className = "status-track";
        var fill = document.createElement("span");
        fill.style.width = row[2] + "%";
        track.appendChild(fill);
        var value = document.createElement("em");
        value.textContent = row[1];
        item.appendChild(label);
        item.appendChild(track);
        item.appendChild(value);
        panel.appendChild(item);
      });
      content.appendChild(panel);
      return;
    }
    var table = document.createElement("table");
    table.className = "exhibit-table";
    var body = document.createElement("tbody");
    question.exhibit.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = row[0];
      var td = document.createElement("td");
      td.textContent = row[1];
      tr.appendChild(th);
      tr.appendChild(td);
      body.appendChild(tr);
    });
    table.appendChild(body);
    content.appendChild(table);
  }

  function renderQuestion() {
    var question = quiz.questions[quiz.index];
    quiz.answeredCurrent = false;
    byId("questionDomain").textContent = question.domain;
    byId("questionApproach").textContent = question.approach;
    byId("questionFormat").textContent = question.format;
    byId("questionCounter").textContent = "Question " + (quiz.index + 1) + " of " + quiz.questions.length + " · " + question.task;
    byId("questionText").textContent = question.question;
    byId("formatInstruction").textContent = questionInstruction(question);
    byId("quizProgressBar").style.width = percent(quiz.index, quiz.questions.length) + "%";
    var stimulus = byId("questionStimulus");
    stimulus.hidden = !question.stimulus;
    byId("stimulusText").textContent = question.stimulus || "";
    renderExhibit(question);
    var flagged = state.flags.indexOf(question.id) !== -1;
    byId("flagButton").setAttribute("aria-pressed", String(flagged));
    byId("flagButton").textContent = flagged ? "★ Flagged" : "☆ Flag";
    var list = byId("choiceList");
    list.innerHTML = "";
    question.choices.forEach(function (choice, index) {
      var label = document.createElement("label");
      label.className = "choice" + (question.type === "sequence" ? " sequence-choice" : "");
      var input;
      if (question.type === "sequence") {
        input = document.createElement("select");
        input.name = "sequence-" + index;
        input.dataset.index = String(index);
        var promptOption = document.createElement("option");
        promptOption.value = "";
        promptOption.textContent = "—";
        input.appendChild(promptOption);
        question.choices.forEach(function (_, position) {
          var option = document.createElement("option");
          option.value = String(position + 1);
          option.textContent = String(position + 1);
          input.appendChild(option);
        });
      } else {
        input = document.createElement("input");
        input.type = question.type === "multiple" ? "checkbox" : "radio";
        input.name = "answer";
        input.value = String(index);
      }
      var letter = document.createElement("span");
      letter.className = "choice-letter";
      letter.textContent = question.type === "sequence" ? "Step" : String.fromCharCode(65 + index);
      var text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = choice;
      label.appendChild(input);
      if (question.type !== "sequence") label.appendChild(letter);
      label.appendChild(text);
      list.appendChild(label);
    });
    byId("submitAnswerButton").hidden = false;
    byId("explanationPanel").hidden = true;
  }

  function selectedAnswer(question) {
    if (question.type === "sequence") {
      var positions = Array.prototype.slice.call(document.querySelectorAll("select[name^='sequence-']")).map(function (select) { return Number(select.value); });
      if (positions.some(function (position) { return !position; })) { toast("Assign a position to every step."); return null; }
      if (new Set(positions).size !== positions.length) { toast("Use each sequence position exactly once."); return null; }
      return positions;
    }
    var selected = Array.prototype.slice.call(document.querySelectorAll("input[name='answer']:checked")).map(function (input) { return Number(input.value); });
    if (question.type === "multiple") {
      if (selected.length !== question.selectCount) { toast("Select exactly " + question.selectCount + " responses."); return null; }
      return selected.sort(function (a, b) { return a - b; });
    }
    if (!selected.length) { toast("Choose an answer before submitting."); return null; }
    return selected[0];
  }

  function arraysEqual(left, right) {
    return left.length === right.length && left.every(function (value, index) { return value === right[index]; });
  }

  function isCorrectAnswer(question, selected) {
    if (question.type === "multiple") return arraysEqual(selected, question.answers);
    if (question.type === "sequence") return arraysEqual(selected, question.answer);
    return selected === question.answer;
  }

  function correctAnswerSummary(question) {
    if (question.type === "multiple") return "Correct responses: " + question.answers.map(function (index) { return String.fromCharCode(65 + index); }).join(" and ");
    if (question.type === "sequence") {
      var ordered = question.choices.map(function (choice, index) { return { choice: choice, position: question.answer[index] }; }).sort(function (a, b) { return a.position - b.position; });
      return "Correct sequence: " + ordered.map(function (item) { return item.position + ". " + item.choice; }).join(" → ");
    }
    return "Best answer: " + String.fromCharCode(65 + question.answer);
  }

  function markSubmittedAnswers(question, selected) {
    var choices = Array.prototype.slice.call(document.querySelectorAll(".choice"));
    choices.forEach(function (choice, index) {
      var control = choice.querySelector("input, select");
      control.disabled = true;
      if (question.type === "multiple") {
        if (question.answers.indexOf(index) !== -1) choice.classList.add("correct");
        if (selected.indexOf(index) !== -1 && question.answers.indexOf(index) === -1) choice.classList.add("incorrect");
      } else if (question.type === "sequence") {
        choice.classList.add(selected[index] === question.answer[index] ? "correct" : "incorrect");
      } else {
        if (index === question.answer) choice.classList.add("correct");
        if (index === selected && selected !== question.answer) choice.classList.add("incorrect");
      }
    });
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (quiz.answeredCurrent) return;
    var question = quiz.questions[quiz.index];
    var selected = selectedAnswer(question);
    if (selected === null) return;
    var correct = isCorrectAnswer(question, selected);
    quiz.answeredCurrent = true;
    quiz.results.push({ id: question.id, correct: correct, domain: question.domain, format: question.format });
    var previous = state.answers[question.id];
    state.answers[question.id] = { correct: correct, selected: selected, attempts: (previous ? previous.attempts : 0) + 1, lastAt: new Date().toISOString() };
    state.history.push({ id: question.id, correct: correct, selected: selected, date: new Date().toISOString() });
    if (state.history.length > 10000) state.history = state.history.slice(-10000);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    markSubmittedAnswers(question, selected);
    var banner = byId("resultBanner");
    banner.className = "result-banner " + (correct ? "correct" : "incorrect");
    banner.textContent = correct ? "Correct — strong judgment" : "Not quite — review the answer pattern";
    byId("correctAnswerText").textContent = correctAnswerSummary(question);
    byId("explanationText").textContent = question.explanation;
    byId("examLensText").textContent = question.lens;
    byId("explanationPanel").hidden = false;
    byId("submitAnswerButton").hidden = true;
    byId("nextQuestionButton").textContent = quiz.index === quiz.questions.length - 1 ? "Finish set" : "Next question";
    byId("explanationPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function nextQuestion() {
    if (quiz.index >= quiz.questions.length - 1) { showQuizResults(); return; }
    quiz.index += 1;
    renderQuestion();
    byId("questionCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showQuizResults() {
    byId("questionCard").hidden = true;
    var correct = quiz.results.filter(function (item) { return item.correct; }).length;
    var score = percent(correct, quiz.results.length);
    byId("quizScoreTitle").textContent = score + "% · " + correct + " of " + quiz.results.length + " correct";
    byId("quizScoreCopy").textContent = score >= 80 ? "Strong set. Review any misses by decision rule, then increase the set length." : score >= 70 ? "Solid foundation. Rework the missed scenarios before moving on." : "This set found useful gaps. Slow down, identify what the question asks, and review every explanation.";
    var domains = ["People", "Process", "Business Environment"].map(function (domain) {
      var matching = quiz.results.filter(function (item) { return item.domain === domain; });
      return { label: domain, answered: matching.length, correct: matching.filter(function (item) { return item.correct; }).length, accuracy: percent(matching.filter(function (item) { return item.correct; }).length, matching.length) };
    }).filter(function (item) { return item.answered; });
    renderMetrics(byId("quizDomainResults"), domains, "Not in this set");
    byId("reviewMissedButton").hidden = !quiz.results.some(function (item) { return !item.correct; });
    byId("quizResults").hidden = false;
    refreshAll();
    byId("quizResults").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function resetQuiz() {
    quiz = { questions: [], index: 0, results: [], answeredCurrent: false };
    byId("questionCard").hidden = true;
    byId("quizResults").hidden = true;
    byId("quizBuilder").hidden = false;
  }
  function toggleFlag() {
    var question = quiz.questions[quiz.index];
    var index = state.flags.indexOf(question.id);
    if (index === -1) state.flags.push(question.id); else state.flags.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderQuestionFlagOnly(question.id);
  }
  function renderQuestionFlagOnly(id) {
    var flagged = state.flags.indexOf(id) !== -1;
    byId("flagButton").setAttribute("aria-pressed", String(flagged));
    byId("flagButton").textContent = flagged ? "★ Flagged" : "☆ Flag";
    toast(flagged ? "Question flagged for review." : "Flag removed.");
  }

  function updateProgress() {
    var answers = answerMetrics();
    var plan = scheduleMetrics();
    byId("progressReadiness").textContent = readiness() + "%";
    byId("masteredStat").textContent = answers.correct;
    byId("needsReviewStat").textContent = answers.answered - answers.correct;
    byId("planCompleteStat").textContent = plan.percent + "%";
    byId("planSessionsStat").textContent = plan.complete + " of " + plan.total + " sessions";
    renderMetrics(byId("domainProgress"), groupMetrics("domain", ["People", "Process", "Business Environment"]), "No answers yet");
    renderMetrics(byId("approachProgress"), groupMetrics("approach", ["Predictive", "Agile", "Hybrid"]), "No answers yet");
    renderMetrics(byId("formatProgress"), groupMetrics("format", ["Single response", "Multiple response", "Case study", "Graphic-based", "Sequence / drag-style"]), "No answers yet");
    var list = byId("studyLogList");
    list.innerHTML = "";
    state.logs.slice().reverse().slice(0, 8).forEach(function (item) {
      var row = document.createElement("div");
      row.className = "log-row";
      row.innerHTML = "<time>" + formatDate(new Date(item.date)) + "</time><strong>" + item.minutes + " min</strong><div><span>" + escapeHtml(item.focus) + "</span> <small>" + escapeHtml(item.note || "") + "</small></div>";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Remove";
      button.addEventListener("click", function () { state.logs = state.logs.filter(function (log) { return log.id !== item.id; }); saveState(); });
      row.appendChild(button);
      list.appendChild(row);
    });
    if (!state.logs.length) list.innerHTML = "<p>No manual study sessions logged yet.</p>";
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]; });
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach(function (view) { var active = view.dataset.view === name; view.hidden = !active; view.classList.toggle("active", active); });
    document.querySelectorAll(".nav-button").forEach(function (button) { button.classList.toggle("active", button.dataset.target === name); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function refreshAll() {
    updateDashboard();
    updatePlan();
    updateProgress();
  }
  function applySettings() {
    state.settings.examDate = byId("examDateInput").value || defaultState.settings.examDate;
    state.settings.weekdayMinutes = Number(byId("weekdayMinutesInput").value);
    state.settings.longMinutes = Number(byId("longMinutesInput").value);
    saveState();
  }
  function startScheduledSession(sessionId) {
    var session = buildSchedule().find(function (item) { return item.id === sessionId; });
    if (!session) { showView("plan"); return; }
    var size = session.activity.indexOf("180-question") !== -1 ? 180 : session.activity.indexOf("25-question") !== -1 ? 25 : session.activity.indexOf("50-question") !== -1 ? 50 : 10;
    startQuickQuiz({ set: session.filter.set, domain: session.filter.domain, approach: session.filter.approach }, size);
  }
  function exportProgress() {
    var exportData = { exportedAt: new Date().toISOString(), app: "S3 PMP Study Companion v4 — 800 Item Model", librarySize: QUESTIONS.length, settings: state.settings, progress: state, summary: { readiness: readiness(), answers: answerMetrics(), schedule: scheduleMetrics(), totalMinutes: totalMinutes() } };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "s3-pmp-progress-" + todayKey() + ".json";
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Progress export created.");
  }

  function bindEvents() {
    document.querySelectorAll(".nav-button").forEach(function (button) { button.addEventListener("click", function () { showView(button.dataset.target); }); });
    ["examDateInput", "weekdayMinutesInput", "longMinutesInput"].forEach(function (id) { byId(id).addEventListener("change", applySettings); });
    byId("buildQuizButton").addEventListener("click", function () {
      var criteria = { set: byId("questionFilter").value, domain: byId("domainFilter").value, approach: byId("approachFilter").value, format: byId("formatFilter").value };
      startQuickQuiz(criteria, Number(byId("quizSize").value));
    });
    byId("resetQuizButton").addEventListener("click", resetQuiz);
    byId("answerForm").addEventListener("submit", submitAnswer);
    byId("nextQuestionButton").addEventListener("click", nextQuestion);
    byId("flagButton").addEventListener("click", toggleFlag);
    byId("anotherSetButton").addEventListener("click", resetQuiz);
    byId("reviewMissedButton").addEventListener("click", function () { startQuickQuiz({ set: "missed", domain: "all", approach: "all" }, 25); });
    byId("startTodayButton").addEventListener("click", function () { startScheduledSession(byId("startTodayButton").dataset.sessionId); });
    byId("completeTodayButton").addEventListener("click", function () { if (byId("completeTodayButton").dataset.sessionId) toggleSession(byId("completeTodayButton").dataset.sessionId); });
    byId("studyLogForm").addEventListener("submit", function (event) {
      event.preventDefault();
      state.logs.push({ id: Date.now(), date: new Date().toISOString(), minutes: Number(byId("logMinutes").value), focus: byId("logFocus").value, note: byId("logNote").value.trim() });
      byId("logNote").value = "";
      saveState();
      toast("Study session logged.");
    });
    byId("exportButton").addEventListener("click", exportProgress);
    byId("clearDataButton").addEventListener("click", function () {
      if (window.confirm("Clear all answers, flags, schedule completion, and study logs?")) {
        state = JSON.parse(JSON.stringify(defaultState));
        localStorage.removeItem(STORAGE_KEY);
        resetQuiz();
        refreshAll();
        toast("Progress cleared.");
      }
    });
    window.addEventListener("beforeinstallprompt", function (event) { event.preventDefault(); deferredInstallPrompt = event; byId("installButton").hidden = false; });
    byId("installButton").addEventListener("click", function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function () { deferredInstallPrompt = null; byId("installButton").hidden = true; });
    });
  }

  function init() {
    if (QUESTIONS.length !== 800) console.warn("Expected 800 questions; found", QUESTIONS.length);
    bindEvents();
    refreshAll();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
