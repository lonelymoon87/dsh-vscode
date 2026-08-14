const vscode = acquireVsCodeApi()

const transcript = document.querySelector('#transcript')
const status = document.querySelector('#status')
const usage = document.querySelector('#usage')
const prompt = document.querySelector('#prompt')
const send = document.querySelector('#send')
const newSession = document.querySelector('#new-session')
const restartRuntime = document.querySelector('#restart-runtime')

function appendText(parent, tag, className, text) {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  parent.append(element)
  return element
}

function renderMessage(message) {
  const card = document.createElement('article')
  card.className = `message ${message.role}`
  appendText(card, 'div', 'label', message.role)
  appendText(card, 'div', 'content', message.text || (message.streaming ? '…' : ''))
  transcript.append(card)
}

function renderTool(tool) {
  const card = document.createElement('details')
  card.className = `tool ${tool.status}`
  const summary = document.createElement('summary')
  appendText(summary, 'span', 'tool-name', tool.name)
  appendText(summary, 'span', 'tool-status', tool.status)
  card.append(summary)
  appendText(card, 'pre', 'tool-arguments', JSON.stringify(tool.arguments, null, 2))
  if (tool.output) appendText(card, 'pre', 'tool-output', tool.output)
  if (tool.error) appendText(card, 'div', 'tool-error', tool.error)
  if (Array.isArray(tool.diffs)) {
    tool.diffs.forEach((diff, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'diff-button'
      button.textContent = `Open diff · ${diff.path}`
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'openDiff', callId: tool.callId, index })
      })
      card.append(button)
    })
  }
  transcript.append(card)
}

function render(state) {
  status.textContent = state.status
  status.className = `status ${state.status}`
  const busy = state.status === 'running' || state.status === 'starting'
  prompt.disabled = busy
  send.disabled = busy
  newSession.disabled = busy
  restartRuntime.disabled = busy
  transcript.replaceChildren()
  state.messages.forEach(renderMessage)
  state.tools.forEach(renderTool)
  const tokens = state.usage
  usage.textContent = `in ${tokens.inputTokens + tokens.cacheReadTokens} · out ${tokens.outputTokens}`
  transcript.scrollTop = transcript.scrollHeight
}

function submit() {
  const text = prompt.value.trim()
  if (!text || send.disabled) return
  vscode.postMessage({ type: 'prompt', text })
  prompt.value = ''
}

send.addEventListener('click', submit)
prompt.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
  event.preventDefault()
  submit()
})
newSession.addEventListener('click', () => vscode.postMessage({ type: 'newSession' }))
restartRuntime.addEventListener('click', () => vscode.postMessage({ type: 'restartRuntime' }))
window.addEventListener('message', (event) => {
  if (event.data?.type === 'state') render(event.data.state)
})
