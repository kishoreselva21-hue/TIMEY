/**
 * gemini-brain.js
 * Teammate 3: Dual-Brain Architecture (Gemini AI + Deterministic Solver)
 * Converts unstructured chaos prompts & syllabus images into strict JSON tasks,
 * and explains solver schedule diffs in plain language.
 */

(function () {
  const GEMINI_MODEL = 'gemini-2.5-flash';

  function hoursFromNow(h) {
    return new Date(Date.now() + h * 3600 * 1000).toISOString();
  }

  // Convert an uploaded File (image or PDF) into base64 for Gemini multimodal input
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const base64Data = result.split(',')[1];
        resolve({
          mimeType: file.type || 'image/png',
          data: base64Data
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Deterministic Offline NLP Fallback so the hackathon demo works 100% even without Wi-Fi/API key
  function offlineChaosParser(rawText) {
    const text = (rawText || '').trim();
    if (!text) return [];

    // Split on newlines, semicolons, or "and also"
    const chunks = text
      .split(/\n|;|(?:\.\s+)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    const subjectKeywords = [
      { key: /ds|data\s*struct|tree|graph|algo/i, subject: 'Data Structures', credits: 4 },
      { key: /os|operating|kernel|thread|deadlock|paging/i, subject: 'Operating Systems', credits: 4 },
      { key: /math|linear|algebra|calc|matrix|eigen/i, subject: 'Linear Algebra', credits: 3 },
      { key: /net|tcp|http|routing|socket/i, subject: 'Computer Networks', credits: 3 },
      { key: /se|software|agile|uml|project|hackathon/i, subject: 'Software Eng', credits: 3 }
    ];

    return chunks.map((chunk, idx) => {
      const matched = subjectKeywords.find((s) => s.key.test(chunk)) || {
        subject: 'General Studies',
        credits: 3
      };

      const isExam = /exam|quiz|test|viva|midsem|final/i.test(chunk);
      const isUrgent = /tomorrow|tonight|urgent|asap|today|morning|panic/i.test(chunk);
      const hourMatch = chunk.match(/(\d+)\s*(?:hr|hour)/i);
      const estimatedMins = hourMatch ? Math.min(240, Math.max(60, parseInt(hourMatch[1], 10) * 60)) : isExam ? 120 : 60;

      let deadlineHours = 72 + idx * 12;
      if (/today|tonight/i.test(chunk)) deadlineHours = 12;
      else if (/tomorrow/i.test(chunk)) deadlineHours = 26;
      else if (/2\s*days/i.test(chunk)) deadlineHours = 48;

      return {
        id: 't-ai-' + Date.now() + '-' + idx,
        title: chunk.charAt(0).toUpperCase() + chunk.slice(1, 55),
        subject: matched.subject,
        credits: matched.credits,
        deadlineISO: hoursFromNow(deadlineHours),
        estimatedMins,
        priority: isUrgent || isExam ? 'CRITICAL' : 'HIGH',
        type: isExam ? 'EXAM' : 'STUDY'
      };
    });
  }

  // Main Dual-Brain Input Parser: Calls Gemini API if key exists, otherwise uses Offline Parser
  async function parseChaosToConstraints(promptText, fileObj = null) {
    const apiKey = (window.AppState && window.AppState.geminiApiKey || '').trim();

    if (!apiKey) {
      // Simulate brief neural processing delay for UX realism
      await new Promise((r) => setTimeout(r, 450));
      const tasks = offlineChaosParser(
        promptText || 'Data Structures Graph Lab due tomorrow 2 hours; Operating Systems surprise quiz in 2 days'
      );
      return {
        source: 'OFFLINE_NEURAL_FALLBACK',
        tasks,
        note: 'Parsed via built-in Local Constraint Extractor (add a Gemini API Key in settings for live multimodal LLM parsing).'
      };
    }

    const systemPrompt = `You are the AI Front-End Brain of an academic timetable solver.
Extract all tasks, exams, assignments, or lectures from the user's text and/or uploaded syllabus/timetable file.
Current ISO timestamp: ${new Date().toISOString()}.
Return ONLY a valid JSON object matching this exact schema:
{
  "tasks": [
    {
      "title": "Short actionable task title",
      "subject": "Subject name",
      "credits": 3,
      "deadlineISO": "Future ISO 8601 date string",
      "estimatedMins": 60,
      "priority": "CRITICAL | HIGH | MEDIUM | LOW",
      "type": "STUDY | EXAM | LECTURE"
    }
  ]
}
Ensure estimatedMins is a multiple of 60 (60, 120, or 180).`;

    const parts = [{ text: systemPrompt + '\n\nUser Chaos Input:\n' + (promptText || 'Extract schedule items from attached file.') }];

    if (fileObj) {
      const encoded = await fileToBase64(fileObj);
      parts.push({
        inlineData: {
          mimeType: encoded.mimeType,
          data: encoded.data
        }
      });
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(rawJson);

      const cleanTasks = (parsed.tasks || []).map((t, i) => ({
        id: 't-gem-' + Date.now() + '-' + i,
        title: t.title || 'AI Extracted Study Block',
        subject: t.subject || 'General Studies',
        credits: Number(t.credits) || 3,
        deadlineISO: t.deadlineISO || hoursFromNow(48),
        estimatedMins: Math.max(60, Math.round((Number(t.estimatedMins) || 60) / 60) * 60),
        priority: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(t.priority) ? t.priority : 'HIGH',
        type: ['STUDY', 'EXAM', 'LECTURE'].includes(t.type) ? t.type : 'STUDY'
      }));

      return {
        source: 'GEMINI_2_5_FLASH',
        tasks: cleanTasks.length ? cleanTasks : offlineChaosParser(promptText),
        note: `Gemini 2.5 Flash extracted ${cleanTasks.length} structured constraint(s).`
      };
    } catch (err) {
      console.warn('[GeminiBrain] API call failed, falling back to local parser:', err);
      return {
        source: 'OFFLINE_FALLBACK_ON_ERROR',
        tasks: offlineChaosParser(promptText),
        note: `Gemini API unreachable (${err.message}); seamlessly fell back to local constraint parser.`
      };
    }
  }

  // Generates a plain-English explanation of why the solver moved blocks around
  async function explainScheduleDiff(beforeSchedule, afterSchedule, mode) {
    const apiKey = (window.AppState && window.AppState.geminiApiKey || '').trim();
    const movedCount = afterSchedule.filter((afterSlot) => {
      const prev = beforeSchedule.find((b) => b.taskId === afterSlot.taskId);
      return !prev || prev.dayIndex !== afterSlot.dayIndex || prev.startHour !== afterSlot.startHour;
    }).length;

    const lockedCount = afterSchedule.filter((s) => s.isLocked).length;
    const survival = window.AppState?.simulationResult?.survivalProbability ?? 80;

    // Smart deterministic explanation used both offline and as fast baseline
    const localSummary =
      mode === 'EMERGENCY'
        ? `EMERGENCY PROTOCOL: Dropped low-credit tasks (<3 credits) and compressed buffers to pack ${afterSchedule.length} critical hours into the next 48h while respecting ${lockedCount} pinned slot(s).`
        : mode === 'EXAM'
        ? `EXAM PREP ACTIVE: Prioritized high-credit subjects during peak circadian hours (9 AM–12 PM) and injected spaced-repetition review blocks. ${movedCount} block(s) shifted; survival odds at ${survival}%.`
        : `Re-optimized ${movedCount} block(s) around ${lockedCount} pinned constraint(s) using deadline-decay & circadian energy weights. Current Monte Carlo survival rate: ${survival}%.`;

    if (!apiKey) {
      window.AppState.aiAdvisorLog = localSummary;
      return localSummary;
    }

    try {
      const prompt = `You are an academic AI timetable advisor. Summarize this schedule update in 2 crisp, encouraging sentences for a college student.
Mode: ${mode}
Blocks re-optimized: ${movedCount}
Pinned/Locked blocks preserved: ${lockedCount}
Monte Carlo Schedule Survival Probability: ${survival}%
Top scheduled items: ${afterSchedule
        .slice(0, 4)
        .map((s) => `${s.title} (Day ${s.dayIndex + 1} @ ${s.startHour}:00)`)
        .join(', ')}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 120 }
          })
        }
      );

      if (!response.ok) throw new Error('Gemini advisor error');
      const data = await response.json();
      const advice = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || localSummary;
      window.AppState.aiAdvisorLog = advice;
      return advice;
    } catch (e) {
      window.AppState.aiAdvisorLog = localSummary;
      return localSummary;
    }
  }

  window.GeminiBrain = {
    parseChaosToConstraints,
    explainScheduleDiff
  };
})();