const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const stopBtn = document.getElementById("stopBtn");
const chatBody = document.getElementById("chatBody");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const turnCount = document.getElementById("turnCount");
const turnLimitLabel = document.getElementById("turnLimitLabel");

const topicInput = document.getElementById("topicInput");
const toneSelect = document.getElementById("toneSelect");
const turnLimitInput = document.getElementById("turnLimit");
const globalInstruction = document.getElementById("globalInstruction");

const agent1Name = document.getElementById("agent1Name");
const agent1Provider = document.getElementById("agent1Provider");
const agent1Instruction = document.getElementById("agent1Instruction");
const agent1Model = document.getElementById("agent1Model");
const agent1Key = document.getElementById("agent1Key");

const agent2Name = document.getElementById("agent2Name");
const agent2Provider = document.getElementById("agent2Provider");
const agent2Instruction = document.getElementById("agent2Instruction");
const agent2Model = document.getElementById("agent2Model");
const agent2Key = document.getElementById("agent2Key");

const state = {
  running: false,
  turn: 0,
  maxTurns: 12,
  activeAgent: 1,
  messages: [],
};

const mockLines = [
  "I see your point, but the evidence suggests a more nuanced outcome.",
  "Let me challenge that: are we assuming a fixed definition of progress?",
  "The long-term implications matter more than the short-term benefits.",
  "We should separate ethical intent from unintended consequences.",
  "A balanced view recognizes both the risks and the opportunities.",
];

function setStatus(text, active) {
  statusLabel.textContent = text;
  if (active) {
    statusDot.classList.add("active");
  } else {
    statusDot.classList.remove("active");
  }
}

function resetDebate() {
  state.turn = 0;
  state.messages = [];
  state.activeAgent = 1;
  chatBody.innerHTML = "";
  updateTurnCount();
}

function updateTurnCount() {
  turnCount.textContent = String(state.turn);
  turnLimitLabel.textContent = String(state.maxTurns);
}

function addMessage(agentId, content) {
  const name = agentId === 1 ? agent1Name.value.trim() || "Agent 1" : agent2Name.value.trim() || "Agent 2";
  const message = { agentId, name, content, timestamp: new Date() };
  state.messages.push(message);

  const wrapper = document.createElement("div");
  wrapper.className = `message ${agentId === 2 ? "agent2" : "agent1"}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = name.slice(0, 2).toUpperCase();

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<span>${name}</span><span>${message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>`;

  const text = document.createElement("div");
  text.className = "content";
  text.textContent = content;

  bubble.appendChild(meta);
  bubble.appendChild(text);
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  chatBody.appendChild(wrapper);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function buildPrompt(agentId) {
  const topic = topicInput.value.trim();
  const tone = toneSelect.value;
  const global = globalInstruction.value.trim();
  const side = agentId === 1 ? agent1Instruction.value.trim() : agent2Instruction.value.trim();

  return [
    `Topic: ${topic || "Open debate"}`,
    `Tone: ${tone}`,
    global ? `Global instructions: ${global}` : null,
    side ? `Your side: ${side}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function conversationForAgent(agentId) {
  return state.messages.map((msg) => ({
    role: msg.agentId === agentId ? "assistant" : "user",
    content: msg.content,
  }));
}

function randomMockReply(agentId) {
  const base = mockLines[Math.floor(Math.random() * mockLines.length)];
  const topic = topicInput.value.trim();
  const stance = agentId === 1 ? "optimistic" : "skeptical";
  const addon = topic ? `On ${topic}, I lean ${stance}.` : `I lean ${stance} on this.`;
  return `${base} ${addon}`;
}

async function callAgent(agentId) {
  const provider = agentId === 1 ? agent1Provider.value : agent2Provider.value;
  const model = agentId === 1 ? agent1Model.value.trim() : agent2Model.value.trim();
  const key = agentId === 1 ? agent1Key.value.trim() : agent2Key.value.trim();

  if (provider === "mock") {
    return randomMockReply(agentId);
  }

  const systemPrompt = buildPrompt(agentId);
  const messages = conversationForAgent(agentId);

  try {
    if (!key) {
      return "Error: Missing Gemini API key.";
    }

    const modelName = model || "gemini-2.5-flash";
    const buildContents = (history) => {
      const contents = [];
      if (systemPrompt) {
        contents.push({
          role: "user",
          parts: [{ text: systemPrompt }],
        });
      }
      contents.push(
        ...history.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }))
      );
      return contents;
    };

    const generateOnce = async (history) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: buildContents(history),
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 1024,
            },
          }),
        }
      );
      const data = await response.json();
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "",
        finishReason: data.candidates?.[0]?.finishReason || "",
      };
    };

    let { text, finishReason } = await generateOnce(messages);
    if (!text) {
      return "(No response)";
    }

    if (finishReason === "MAX_TOKENS") {
      const continuation = await generateOnce([
        ...messages,
        { role: "assistant", content: text },
        { role: "user", content: "Continue exactly where you left off. No repetition." },
      ]);
      if (continuation.text) {
        text = `${text} ${continuation.text}`.trim();
      }
    }

    return text;
  } catch (err) {
    return `Error: ${err.message || "Request failed"}`;
  }
}

async function advanceTurn() {
  if (!state.running) return;
  if (state.turn >= state.maxTurns) {
    stopDebate();
    return;
  }

  nextBtn.disabled = true;
  const agentId = state.activeAgent;
  const reply = await callAgent(agentId);
  addMessage(agentId, reply);

  state.turn += 1;
  state.activeAgent = agentId === 1 ? 2 : 1;
  updateTurnCount();
  nextBtn.disabled = false;

  if (state.turn >= state.maxTurns) {
    stopDebate();
  }
}

function startDebate() {
  state.running = true;
  state.maxTurns = Number(turnLimitInput.value) || 12;
  resetDebate();
  setStatus("Live", true);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  nextBtn.disabled = false;

  addMessage(1, "Hello! Ready to debate.");
  addMessage(2, "Hi there. Let us begin.");
}

function stopDebate() {
  state.running = false;
  setStatus("Stopped", false);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  nextBtn.disabled = true;
}

startBtn.addEventListener("click", startDebate);
stopBtn.addEventListener("click", stopDebate);
nextBtn.addEventListener("click", advanceTurn);

turnLimitInput.addEventListener("change", () => {
  state.maxTurns = Number(turnLimitInput.value) || 12;
  updateTurnCount();
});

updateTurnCount();
setStatus("Idle", false);
