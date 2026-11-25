// Mock YouTube watch page generator for testing
export function generateWatchHtml(videoId) {
  const vType = (videoId || '')[0] || 'D';
  const hasCaptions = vType !== 'Z';
  const hasRouteA = vType !== 'Z' && vType !== 'U';
  const hasAsk = vType !== 'N';

  // Storyboard spec string
  const storyboardSpec = 'https://i.ytimg.com/sb/$L/$N.jpg|48#27#100#10#10#1000#M$M#sigh123|80#45#100#10#10#1000#M$M#sigh456';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Watch: ${videoId}</title>
</head>
<body data-video-id="${videoId}" data-variant="${vType}">
  <div id="player" class="html5-video-player">
    <video muted></video>
    <!-- Hidden decoy Ask button that must be ignored -->
    <div class="you-chat-entrypoint-button" style="display: none;">
      <button aria-label="Ask questions (decoy)">Ask Decoy</button>
    </div>
  </div>

  <ytd-watch-metadata>
    <div id="title">
      <h1 class="ytd-watch-metadata">Sample Video ${videoId}</h1>
    </div>

    ${
      hasAsk
        ? `<div class="you-chat-entrypoint-button">
      <button aria-label="Ask questions" id="real-ask-button">Ask</button>
    </div>`
        : ''
    }

    <ytd-video-description-transcript-section-renderer>
      <button aria-label="Show transcript" id="transcript-btn">Show transcript</button>
    </ytd-video-description-transcript-section-renderer>
  </ytd-watch-metadata>

  <!-- YouTube Ask Engagement Panel -->
  <ytd-engagement-panel-section-list-renderer target-id="PAyouchat" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN" style="display:none;">
    <div id="chat-container">
      <yt-item-section-renderer data-target-id="youchat_messages_section">
        <you-chat-item-view-model class="chat-greeting">Hello! How can I help with this video?</you-chat-item-view-model>
        <div class="chips-row">
          <button class="ytwYouChatChipsDataChip chat-chip">Summarise the video</button>
          <button class="ytwYouChatChipsDataChip chat-chip">Key takeaways</button>
        </div>
      </yt-item-section-renderer>

      <div class="chat-input-view yt-chat-input-view-model">
        <form class="chatInputViewModelChatInputForm">
          <textarea class="chatInputViewModelChatInput" placeholder="Ask about this video..."></textarea>
          <button type="submit" aria-label="Send" disabled="true">Send</button>
        </form>
      </div>
    </div>
  </ytd-engagement-panel-section-list-renderer>

  <!-- YouTube Modern Transcript Panel (for Route B fallback) -->
  <ytd-engagement-panel-section-list-renderer target-id="PAmodern_transcript_view" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN" style="display:none;">
    <div id="transcript-lines">
      ${
        hasCaptions
          ? `<div>00:05</div><div>Welcome to our in-depth examination.</div>
             <div>01:20</div><div>First, we review foundational thermodynamic limits.</div>
             <div>03:15</div><div>Our computational model aligns directly with experimental trials.</div>`
          : ''
      }
    </div>
  </ytd-engagement-panel-section-list-renderer>

  <script>
    // Embedded page scripts simulating YouTube UI behaviors
    window.ytInitialPlayerResponse = {
      playerStoryboardSpecRenderer: {
        spec: ${JSON.stringify(storyboardSpec)}
      }
    };
    window.ytcfg = {
      data_: {
        ${hasRouteA ? `"getTranscriptEndpoint": { "params": "mock_transcript_param_${videoId}" },` : ''}
        "INNERTUBE_API_KEY": "AIzaSyMockKey123",
        "INNERTUBE_CONTEXT_CLIENT_VERSION": "2.20240101.00.00"
      }
    };

    // Make markers searchable in page HTML for regex matching
    /* "playerStoryboardSpecRenderer":{"spec":"${storyboardSpec}"} */
    /* ${hasRouteA ? `"getTranscriptEndpoint":{"params":"mock_params_${videoId}"}` : ''} */
    /* "INNERTUBE_API_KEY":"AIzaMockKey" */
    /* "INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20240101.00.00" */

    const variant = '${vType}';
    const askPanel = document.querySelector('[target-id="PAyouchat"]');
    const askBtn = document.getElementById('real-ask-button');
    const transcriptPanel = document.querySelector('[target-id="PAmodern_transcript_view"]');
    const transcriptBtn = document.getElementById('transcript-btn');

    if (askBtn) {
      askBtn.addEventListener('click', () => {
        askPanel.style.display = 'block';
        askPanel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      });
    }

    if (transcriptBtn) {
      transcriptBtn.addEventListener('click', () => {
        transcriptPanel.style.display = 'block';
        transcriptPanel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      });
    }

    const ta = document.querySelector('.chatInputViewModelChatInput');
    const sendBtn = document.querySelector('.chatInputViewModelChatInputForm button[aria-label="Send"]');
    const form = document.querySelector('.chatInputViewModelChatInputForm');
    const messagesSection = document.querySelector('[data-target-id="youchat_messages_section"]');

    function submitPrompt(userText) {
      const qItem = document.createElement('you-chat-item-view-model');
      qItem.className = 'user-question';
      qItem.textContent = userText;
      messagesSection.appendChild(qItem);

      messagesSection.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        messagesSection.removeAttribute('aria-busy');
        const ansItem = document.createElement('you-chat-item-view-model');
        ansItem.className = 'assistant-answer';
        const mdDiv = document.createElement('markdown-div');
        mdDiv.innerHTML = '<p>## Summary by YouTube Ask\\n\\n### [00:15] Core Finding\\nThe system demonstrates 40% higher efficiency under load.\\n\\n### [02:30] Experimental Setup\\nAll tests were conducted at ambient pressure.</p>';
        ansItem.appendChild(mdDiv);
        messagesSection.appendChild(ansItem);
      }, 300);
    }

    if (ta && sendBtn) {
      if (variant === 'S') {
        // Enables only for trusted insertText
        document.addEventListener('beforeinput', (e) => {
          if (e.inputType === 'insertText') {
            sendBtn.disabled = false;
            sendBtn.removeAttribute('aria-disabled');
          }
        });
      } else if (variant === 'E') {
        // Send stays disabled, only Enter keydown submits
        sendBtn.disabled = true;
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitPrompt(ta.value || 'Enter query');
          }
        });
      } else if (variant === 'F') {
        // Send never enables, but forced click submits
        sendBtn.disabled = true;
      } else if (variant === 'C') {
        // Send never works, only chip works
        sendBtn.disabled = true;
      } else {
        // Default variant
        ta.addEventListener('input', () => {
          if (ta.value.trim().length > 0) {
            sendBtn.disabled = false;
            sendBtn.removeAttribute('aria-disabled');
          } else {
            sendBtn.disabled = true;
          }
        });
      }

      if (variant !== 'C' && variant !== 'E') {
        sendBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const text = ta.value || 'Default Ask Query';
          submitPrompt(text);
        });
      }

      if (variant !== 'C') {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = ta.value || 'Form Submit Query';
          submitPrompt(text);
        });
      }

      // Chips
      const chips = document.querySelectorAll('.ytwYouChatChipsDataChip');
      chips.forEach((c) => {
        c.addEventListener('click', () => {
          submitPrompt(c.textContent);
        });
      });
    }
  </script>
</body>
</html>`;
}
