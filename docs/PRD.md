# Product Requirements Document

## Unified AI Workspace

**Version:** 1.0
**Status:** Development Ready
**Primary Development Tool:** Claude Code
**Frontend Hosting:** Vercel
**Database and Backend:** Supabase
**Initial Target:** Web application plus browser companion where permitted

---

# 1. Product Overview

Unified AI Workspace is a single ChatGPT-style portal where a user can manage conversations across multiple AI providers from one interface.

Initially supported providers are intended to include:

* ChatGPT
* Claude
* Google Gemini
* Microsoft Copilot
* Perplexity

The portal must allow the user to select:

1. AI provider
2. Provider account
3. Model available under that provider
4. Existing conversation or new conversation

The most important feature is the ability to continue one master conversation while changing AI providers.

Example:

Claude Sonnet → usage unavailable → switch to ChatGPT → continue the same workspace conversation without losing previous context.

The application will not use paid model APIs as its default model execution mechanism.

System APIs such as Supabase, OAuth, browser APIs and internal APIs may be used.

---

# 2. Product Vision

Create one AI workspace where the user does not need to continuously move between:

* chatgpt.com
* claude.ai
* gemini.google.com
* perplexity.ai
* Copilot

The user should be able to manage work, projects, conversations and AI selection from one central interface.

The experience should feel similar to ChatGPT while remaining provider-independent.

---

# 3. Core Product Principle

The application's primary object is not a Claude conversation or ChatGPT conversation.

The primary object is a:

**Master Conversation**

A Master Conversation belongs to our application.

Different AI providers may participate in that conversation.

Example:

```text
Project: RiverLink

Conversation:
Build Lead Management System

User
Create the database architecture.

Claude Sonnet
[response]

User
Now create the authentication flow.

Claude Sonnet
[response]

--- Provider changed ---

User
Review Claude's implementation and improve it.

ChatGPT
[response]

--- Provider changed ---

User
Research alternatives.

Perplexity
[response]
```

The user continues seeing one conversation.

---

# 4. Goals

## 4.1 Primary Goals

The product must allow a user to:

* Sign in to Unified AI Workspace.
* Create projects.
* Create conversations.
* Store conversation history.
* Select an AI provider.
* Select a provider account.
* Select a model.
* send prompts to supported provider integrations.
* receive responses.
* switch provider during an existing conversation.
* preserve conversation context.
* continue working without manually copying previous messages.
* attach files where supported.
* manage multiple provider connections.
* manage preferred provider and model.
* use a ChatGPT-style user experience.

---

# 5. Non-Goals

Version 1 will not attempt to:

* Train AI models.
* Host AI models.
* Replace the providers themselves.
* Circumvent provider usage limits.
* Circumvent CAPTCHA.
* Circumvent authentication security.
* Circumvent provider subscription restrictions.
* Share one AI account between unrelated users.
* Store external AI passwords.
* Reverse-engineer private model APIs.
* Guarantee access to every model shown on provider websites.
* Automatically defeat provider anti-automation mechanisms.

---

# 6. Model API Policy

The product should NOT require these APIs for normal AI execution:

* OpenAI model API
* Anthropic model API
* Gemini model API
* Perplexity model API
* Microsoft AI model API

Other APIs are allowed.

Examples:

* Supabase API
* Supabase Auth
* Supabase Storage
* Google OAuth
* GitHub APIs
* Chrome Extension APIs
* Internal application APIs
* Vercel APIs
* WebSockets
* OAuth APIs
* analytics APIs

Official model APIs may later be introduced as an optional fallback integration, but they must not be required for the initial product concept.

---

# 7. Compliance Requirement

Every AI provider adapter must have an integration status.

Possible values:

```text
supported
experimental
disabled
manual
official_api
```

No adapter may:

* steal authentication cookies
* request the user's AI password
* store provider passwords
* bypass rate limits
* bypass usage limits
* defeat CAPTCHA
* circumvent provider protections

Provider automation must be reviewed against the provider's current terms before production release.

If a provider does not permit programmatic interaction through its consumer web interface, the application must fall back to a compliant integration mode rather than attempting to bypass the restriction.

---

# 8. Target Users

## Primary User

A professional who already pays for multiple AI services.

Example:

```text
Claude Pro
ali@gmail.com

ChatGPT Plus
khan@gmail.com

Gemini Advanced
work@gmail.com

Perplexity Pro
research@gmail.com
```

The user wants one place to manage them.

---

# 9. Primary User Journey

## User Journey 1: New Conversation

User opens Unified AI Workspace.

User clicks:

**New Chat**

Top selector shows:

```text
Claude
Sonnet
ali@gmail.com
```

User enters:

```text
Create a SaaS authentication architecture.
```

The request is sent through the active provider adapter.

Response appears in the workspace.

Conversation is stored in Supabase.

---

# 10. Provider Switching Journey

The user is working with:

```text
Claude
Sonnet
ali@gmail.com
```

After multiple messages, Claude becomes unavailable or the user chooses another provider.

User opens provider selector.

Selects:

```text
ChatGPT
Available GPT Model
khan@gmail.com
```

Unified AI Workspace builds the required conversation context.

The next request is sent to ChatGPT.

The conversation remains the same in the UI.

Previous Claude messages remain visible.

---

# 11. Context Handoff

Provider switching requires a Context Handoff Engine.

Its responsibility is to transform the Master Conversation into context suitable for the next provider.

Basic flow:

```text
Master Conversation
        |
        v
Context Builder
        |
        v
Token and length management
        |
        v
Selected conversation history
        |
        v
New Provider
```

The Context Builder must support:

### Strategy A

Full conversation history.

### Strategy B

Recent N messages.

### Strategy C

Conversation summary plus recent messages.

### Strategy D

Project instructions plus summary plus recent messages.

Strategy selection should initially be automatic.

---

# 12. Conversation Summary

Long conversations require a rolling summary.

Each conversation can maintain:

```text
conversation_summary
```

Example:

```text
The user is developing a Supabase SaaS application.

Current decisions:
- Next.js App Router
- Supabase authentication
- organizations table
- RLS enabled
- Vercel deployment

Current task:
Build the invitation system.
```

When providers are switched, this summary can be included with recent context.

---

# 13. Application Layout

The application should visually follow the familiarity of ChatGPT without copying proprietary branding.

Desktop layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Sidebar     │ Provider / Model / Account                  │
│             │                                             │
│ + New Chat  │                                             │
│             │              Conversation                   │
│ Projects    │                                             │
│             │                                             │
│ Recent      │                                             │
│ Chats       │                                             │
│             │                                             │
│             │                                             │
│ Settings    │ Ask anything...                     Send   │
└────────────────────────────────────────────────────────────┘
```

---

# 14. Sidebar

Sidebar must contain:

* New Chat
* Search
* Projects
* Recent conversations
* Settings
* User profile

Sidebar must support:

* collapse
* expand
* responsive mobile drawer

---

# 15. Top AI Selector

Primary selector should provide the complete AI configuration.

Example:

```text
Claude Sonnet
ali@gmail.com
        ▼
```

Opening it should show:

```text
Claude
  Sonnet
  Opus
  Haiku

ChatGPT
  Model A
  Model B

Gemini
  Pro
  Flash

Perplexity
  Available models

Copilot
  Available models
```

Models must not be permanently hard-coded into UI components.

They should come from provider configuration.

---

# 16. Provider Account Selector

Each provider may contain one or more accounts.

Example:

```text
Claude

✓ ali@gmail.com
  work@gmail.com
+ Connect another account
```

Each connected account should show:

* provider
* account label
* email where available
* connection status
* subscription label if reliably detectable
* last used timestamp
* active/inactive state

---

# 17. Multiple Account Requirement

Long-term architecture must support:

```text
Claude
 ├── Account A
 └── Account B

ChatGPT
 ├── Account A
 └── Account B
```

However, because consumer sites often use browser-profile-level sessions, true concurrent multi-account isolation may require:

* different browser profiles
* isolated browser contexts
* local companion application
* provider-supported OAuth
* another compliant isolation mechanism

Therefore:

**MVP:** One active browser session per provider.

**Phase 2:** Multiple isolated sessions per provider.

Database architecture must support multiple accounts from day one.

---

# 18. Authentication

Unified AI Workspace authentication will use Supabase Auth.

Initial authentication methods:

* Google Sign-In
* Email magic link

Future:

* GitHub
* Microsoft
* password login if required

AI-provider authentication remains separate from portal authentication.

Example:

```text
Portal account:
owner@gmail.com

Claude:
ali@gmail.com

ChatGPT:
khan@gmail.com
```

These do not need to be the same email.

---

# 19. Credential Security

The system must NEVER store:

* Claude password
* ChatGPT password
* Google AI password
* Microsoft password
* Perplexity password

The system should also avoid copying raw long-lived provider authentication cookies into Supabase.

Provider authentication should remain in the appropriate browser or provider-supported authentication mechanism wherever possible.

---

# 20. Projects

Users can organize conversations into projects.

Project fields:

```text
name
description
custom_instructions
default_provider
default_model
created_at
updated_at
```

Example projects:

```text
RiverLink
NaSaDen
Client Website
Personal
Research
```

---

# 21. Project Instructions

Each project can contain instructions.

Example:

```text
This project uses:

Next.js
Supabase
Tailwind
TypeScript

Always generate TypeScript.
Never modify production directly.
```

These instructions become part of the context handoff where appropriate.

---

# 22. Chat Composer

Composer must support:

* multiline text
* Enter to send
* Shift + Enter for newline
* attachments
* stop generation
* regenerate where supported
* copy
* model selector
* account selector
* provider selector

Future:

* voice
* image input
* web search toggle
* reasoning toggle

---

# 23. Message States

Each outgoing request should have a status:

```text
queued
sending
streaming
completed
failed
cancelled
```

Each message should record:

```text
provider
model
account
duration
error
```

---

# 24. Provider Badge

Assistant messages should optionally indicate their source.

Example:

```text
Claude · Sonnet
```

or:

```text
ChatGPT · GPT
```

This allows mixed-provider conversations to remain understandable.

---

# 25. Provider Adapter Architecture

Every AI provider must implement a common interface.

Conceptual interface:

```typescript
interface AIProviderAdapter {
  connect(): Promise<void>;

  getConnectionStatus(): Promise<ConnectionStatus>;

  getModels(): Promise<Model[]>;

  createConversation?(): Promise<string>;

  sendMessage(
    request: ProviderMessageRequest
  ): Promise<ProviderResponse>;

  stopGeneration?(): Promise<void>;

  detectUsageLimit?(): Promise<UsageState>;
}
```

Providers:

```text
ClaudeAdapter
ChatGPTAdapter
GeminiAdapter
PerplexityAdapter
CopilotAdapter
```

The rest of the application should NOT contain provider-specific logic.

---

# 26. Provider Registry

A Provider Registry controls available integrations.

Example:

```typescript
providers = {
  claude: {
    enabled: true,
    adapter: ClaudeAdapter
  },

  chatgpt: {
    enabled: true,
    adapter: ChatGPTAdapter
  }
}
```

This allows integrations to be enabled or disabled without changing the chat UI.

---

# 27. Browser Companion

Where a provider legally and technically permits interaction through an existing browser session, a browser companion may be used.

Responsibilities can include:

* detect provider connection
* communicate with portal
* interact with supported provider session
* report provider state
* return results
* report failures

The browser companion must not be treated as permission to bypass provider restrictions.

---

# 28. Browser Communication

Proposed architecture:

```text
Web App
   |
   | secure local communication
   v
Browser Extension
   |
   v
Provider Tab
```

Communication messages:

```text
CHECK_PROVIDER
SEND_PROMPT
STOP_GENERATION
GET_MODELS
GET_ACCOUNT
GET_STATUS
PROVIDER_RESPONSE
PROVIDER_ERROR
```

---

# 29. Extension Security

The extension must:

* use minimum host permissions
* validate message origin
* reject unknown domains
* never expose credentials to the web application
* avoid broad wildcard permissions where possible
* maintain an explicit allowlist

Allowlist example:

```text
chatgpt.com
claude.ai
gemini.google.com
perplexity.ai
copilot.microsoft.com
```

Actual production domains must be verified during integration.

---

# 30. Supabase Architecture

Services:

* Supabase Auth
* PostgreSQL
* Storage
* Realtime if needed
* Edge Functions where appropriate

---

# 31. Database Schema

## profiles

```text
id uuid PK
email text
display_name text
avatar_url text
created_at timestamptz
updated_at timestamptz
```

---

## providers

```text
id uuid PK
slug text UNIQUE
name text
icon_url text
integration_type text
status text
sort_order integer
created_at timestamptz
```

---

## models

```text
id uuid PK
provider_id uuid FK
external_id text
name text
display_name text
capabilities jsonb
status text
sort_order integer
created_at timestamptz
updated_at timestamptz
```

---

## connected_accounts

```text
id uuid PK
user_id uuid FK
provider_id uuid FK
email text
display_name text
subscription_label text
status text
metadata jsonb
last_connected_at timestamptz
last_used_at timestamptz
created_at timestamptz
updated_at timestamptz
```

No provider password field.

---

## projects

```text
id uuid PK
user_id uuid FK
name text
description text
custom_instructions text
default_provider_id uuid
default_model_id uuid
created_at timestamptz
updated_at timestamptz
```

---

## conversations

```text
id uuid PK
user_id uuid FK
project_id uuid FK nullable
title text
summary text
active_provider_id uuid
active_model_id uuid
active_account_id uuid
created_at timestamptz
updated_at timestamptz
archived_at timestamptz nullable
```

---

## messages

```text
id uuid PK
conversation_id uuid FK
user_id uuid FK
role text
content text
provider_id uuid nullable
model_id uuid nullable
account_id uuid nullable
status text
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

---

## attachments

```text
id uuid PK
user_id uuid FK
conversation_id uuid FK
message_id uuid nullable
file_name text
file_type text
file_size bigint
storage_path text
metadata jsonb
created_at timestamptz
```

---

## provider_sessions

```text
id uuid PK
user_id uuid FK
connected_account_id uuid FK
device_id uuid
status text
metadata jsonb
last_seen_at timestamptz
created_at timestamptz
updated_at timestamptz
```

This table stores metadata, not external provider passwords.

---

## extension_devices

```text
id uuid PK
user_id uuid FK
device_name text
browser text
extension_version text
status text
last_seen_at timestamptz
created_at timestamptz
```

---

## provider_events

```text
id uuid PK
user_id uuid FK
provider_id uuid
account_id uuid nullable
conversation_id uuid nullable
event_type text
metadata jsonb
created_at timestamptz
```

Example events:

```text
connected
disconnected
limit_detected
model_changed
request_failed
session_expired
```

---

# 32. Row Level Security

RLS must be enabled for every user-owned table.

Users can only access:

* their profile
* their accounts
* their projects
* their conversations
* their messages
* their files
* their device records

No user may query another user's data.

---

# 33. File Storage

Supabase Storage structure:

```text
users/
  {userId}/
    projects/
      {projectId}/
        conversations/
          {conversationId}/
```

Storage policies must enforce ownership.

---

# 34. Streaming

Where provider integration supports incremental output, the UI should display streaming text.

Concept:

```text
Provider
   ↓
Adapter
   ↓
Event stream
   ↓
Chat State
   ↓
UI
```

If true streaming is unavailable, simulated incremental rendering is optional but must not pretend the underlying provider is streaming.

---

# 35. Usage Limit Detection

Where reliably available, provider adapters may detect states such as:

```text
usage_limit
session_expired
model_unavailable
login_required
network_error
provider_error
```

If a provider becomes unavailable, UI should show:

```text
Claude is currently unavailable.

Continue with:
ChatGPT
Gemini
Perplexity
```

It must NOT attempt to bypass the provider limit.

---

# 36. Failover Flow

Example:

```text
Claude
      |
      X limit reached
      |
      v
Provider Switch UI
      |
      v
ChatGPT
      |
      v
Context Handoff
      |
      v
Continue Conversation
```

Automatic switching should not happen without a user-configurable preference.

MVP requires manual confirmation.

---

# 37. Settings

Settings sections:

## General

* Theme
* language
* default project

## AI Providers

* Claude
* ChatGPT
* Gemini
* Perplexity
* Copilot

## Connected Accounts

Manage accounts.

## Default AI

Choose:

```text
Provider
Model
Account
```

## Data

* export conversations
* delete conversations
* delete account

---

# 38. Search

Global search should search:

* conversation titles
* message contents
* project names

Initial implementation can use PostgreSQL text search.

Semantic search is future scope.

---

# 39. Responsive Design

Desktop is primary.

Must also work on:

* tablets
* mobile web

Mobile sidebar becomes a drawer.

AI selector remains accessible from chat header.

---

# 40. Theme

Initial themes:

* Light
* Dark
* System

Dark theme should feel close to modern AI chat interfaces.

Avoid directly copying another company's protected visual identity.

---

# 41. Technology Stack

## Frontend

```text
Next.js
TypeScript
React
Tailwind CSS
shadcn/ui
Lucide Icons
```

## Backend

```text
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
```

## Hosting

```text
Vercel
```

## Companion

```text
Chrome Extension
Manifest V3
TypeScript
```

## Development

```text
Claude Code
Git
GitHub
```

---

# 42. Proposed Repository Structure

```text
unified-ai-workspace/

apps/
  web/
  extension/

packages/
  ui/
  types/
  provider-core/
  config/
  utils/

supabase/
  migrations/
  seed.sql
  functions/

docs/
  PRD.md
  ARCHITECTURE.md
  PROVIDER_ADAPTERS.md
  SECURITY.md

README.md
package.json
pnpm-workspace.yaml
```

Recommended monorepo tooling:

```text
pnpm workspaces
```

Turborepo may be added if needed.

---

# 43. Web Application Structure

```text
apps/web/src/

app/
  (auth)/
  (dashboard)/
    chat/
    projects/
    settings/

components/
  chat/
  sidebar/
  providers/
  projects/
  settings/
  shared/

lib/
  supabase/
  providers/
  auth/
  storage/

hooks/
stores/
types/
```

---

# 44. Extension Structure

```text
apps/extension/src/

background/
  service-worker.ts

content/
  claude/
  chatgpt/
  gemini/
  perplexity/
  copilot/

providers/
  registry.ts
  types.ts

messaging/
security/
storage/
```

---

# 45. Shared Provider Types

Provider implementation should use shared types.

```typescript
type ProviderSlug =
  | "claude"
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "copilot";
```

Connection state:

```typescript
type ProviderConnectionState =
  | "connected"
  | "disconnected"
  | "login_required"
  | "unsupported"
  | "error";
```

---

# 46. State Management

Prefer simple architecture initially.

Recommended:

* React Server Components where appropriate
* TanStack Query for server state if needed
* Zustand for lightweight local app state

Avoid unnecessary global state.

---

# 47. Error Handling

Errors must be normalized.

Example:

```typescript
interface ProviderError {
  code: string;
  provider: ProviderSlug;
  message: string;
  recoverable: boolean;
}
```

Example codes:

```text
LOGIN_REQUIRED
SESSION_EXPIRED
MODEL_UNAVAILABLE
USAGE_LIMIT
PROVIDER_CHANGED
NETWORK_ERROR
UNSUPPORTED_ACTION
```

---

# 48. Logging

Do not log:

* passwords
* authentication cookies
* sensitive tokens
* complete private provider sessions

Logging should capture:

```text
request id
provider
model
duration
status
error code
```

---

# 49. Analytics

Initial internal metrics:

* conversations created
* messages sent
* provider selection frequency
* provider switches
* provider errors
* session failures
* model selection
* average response duration

Do not capture full prompt content for analytics unless explicitly required.

---

# 50. MVP Definition

The first production-development milestone will focus only on:

### Providers

* Claude
* ChatGPT

### Accounts

* One active browser session per provider

### Features

* Portal authentication
* ChatGPT-style UI
* sidebar
* new conversation
* conversation history
* projects
* provider selector
* model selector architecture
* account selector architecture
* Supabase persistence
* provider adapter architecture
* browser extension foundation
* connection status
* master conversations
* context handoff architecture
* Claude ↔ ChatGPT switching
* provider error handling
* Vercel deployment

---

# 51. MVP Exclusions

Do not implement initially:

* Gemini
* Perplexity
* Copilot
* multiple simultaneous accounts for the same provider
* mobile application
* billing
* team accounts
* public marketplace
* advanced analytics
* voice
* image generation controls
* automated limit bypass
* automatic CAPTCHA handling

---

# 52. Phase 2

After MVP validation:

* Gemini integration
* Perplexity integration
* Copilot integration
* better context summarization
* attachment forwarding
* multiple accounts per provider
* provider health monitoring
* global search improvements

---

# 53. Phase 3

Potential advanced features:

* side-by-side AI responses
* ask multiple models simultaneously
* compare responses
* AI routing
* automatic provider recommendations
* project knowledge base
* reusable prompts
* prompt library
* conversation branching
* export Markdown
* export PDF
* team workspaces
* browser and desktop companion

---

# 54. Future Multi-AI Mode

Potential feature:

```text
Ask 3 Models
```

User submits one prompt.

System sends it to:

```text
Claude
ChatGPT
Gemini
```

UI displays:

```text
Claude        ChatGPT        Gemini
Response      Response       Response
```

This is not part of MVP.

---

# 55. Acceptance Criteria: Authentication

MVP authentication is complete when:

* User can sign in.
* User can sign out.
* User session persists.
* Protected routes cannot be accessed when logged out.
* User only sees their own database records.
* Google authentication works.
* RLS policies are tested.

---

# 56. Acceptance Criteria: Conversations

Conversation system is complete when:

* User can create a conversation.
* Conversation appears in sidebar.
* User can rename it.
* User can reopen it.
* Messages reload correctly.
* User can delete/archive it.
* Messages remain in correct order.
* Each AI response records its provider/model/account.

---

# 57. Acceptance Criteria: Provider Selection

Provider selection is complete when:

* Provider dropdown renders.
* Providers can be enabled/disabled.
* Models are grouped by provider.
* Account is selectable.
* Active provider appears in header.
* Active model appears in header.
* Current selection persists per conversation.

---

# 58. Acceptance Criteria: Provider Switching

Provider switching is successful when:

1. User creates a conversation using Provider A.
2. At least several messages are exchanged.
3. User switches to Provider B.
4. Previous messages remain visible.
5. Provider B receives sufficient relevant context.
6. Provider B can answer based on previous work.
7. New response is stored as Provider B.
8. User remains inside the same Master Conversation.

---

# 59. Acceptance Criteria: Security

Security milestone requires:

* No external AI passwords stored.
* RLS enabled.
* Storage ownership policies enabled.
* Sensitive tokens absent from logs.
* Browser messaging validates origin.
* Extension permissions are minimized.
* unauthorized cross-user access tests fail.
* provider restrictions are not bypassed.

---

# 60. Development Phases

## Milestone 1: Foundation

Build:

* monorepo
* Next.js
* Tailwind
* shadcn
* Supabase client
* environment configuration
* authentication
* protected dashboard

---

## Milestone 2: Core UI

Build:

* responsive app shell
* sidebar
* chat header
* provider selector
* model selector
* account selector
* composer
* message list
* empty state
* dark/light theme

Use mock providers initially.

---

## Milestone 3: Database

Implement:

* schema
* migrations
* RLS
* project CRUD
* conversation CRUD
* message CRUD
* account metadata
* provider metadata

---

## Milestone 4: Provider Core

Implement:

* common adapter interface
* provider registry
* connection state
* errors
* provider events
* mock adapters

No website-specific automation yet.

---

## Milestone 5: Browser Extension Foundation

Implement:

* Manifest V3
* service worker
* secure portal communication
* content-script registry
* connection status
* provider detection
* domain allowlist

---

## Milestone 6: First Provider Proof of Concept

Choose one provider whose permitted integration mechanism is validated.

Implement:

* connection
* model discovery where possible
* prompt flow
* response handling
* errors
* session state

This milestone is a technical and compliance proof of concept.

---

## Milestone 7: Second Provider

Implement second supported provider.

Then validate:

```text
Provider A
   ↓
Master Conversation
   ↓
Provider B
```

---

## Milestone 8: Context Handoff

Implement:

* recent-message context
* project instructions
* rolling summaries
* provider switch events
* manual provider switching

---

## Milestone 9: Production Hardening

Implement:

* error monitoring
* loading states
* retries
* security review
* extension permission review
* database indexes
* performance optimization
* production environment

---

## Milestone 10: Deployment

Deploy:

```text
Web Application → Vercel
Database → Supabase
Extension → Development build initially
Repository → GitHub
```

---

# 61. Development Rules for Claude Code

Claude Code must follow these rules during implementation.

1. Read this PRD before modifying architecture.
2. Implement one milestone at a time.
3. Do not add unnecessary dependencies.
4. Use TypeScript strict mode.
5. Do not use `any` unless justified.
6. Keep provider logic outside UI components.
7. Never hard-code secrets.
8. Never commit `.env`.
9. Use Supabase migrations.
10. Enable RLS before treating a feature as complete.
11. Use reusable UI components.
12. Keep provider adapters isolated.
13. Do not automate authentication bypasses.
14. Do not store AI-provider passwords.
15. Do not silently change database architecture.
16. Run lint and type checks after implementation.
17. Build responsive UI from the beginning.
18. Do not implement future milestones prematurely.
19. Keep commits focused by milestone.
20. Update documentation when architecture changes.

---

# 62. Environment Variables

Expected initial variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=
```

Service role keys must never reach client-side bundles.

Additional secrets should be added only when required.

---

# 63. Definition of Done

A feature is not complete merely because UI exists.

A feature is complete when:

* UI works
* backend works
* loading states work
* errors are handled
* mobile layout works
* TypeScript passes
* lint passes
* access controls work
* persistence works
* relevant tests pass
* no sensitive credentials are exposed

---

# 64. MVP Success Scenario

The MVP should ultimately demonstrate this exact experience:

```text
1. User signs into Unified AI Workspace.

2. User creates:
   Project → AI Portal Development

3. User opens a new conversation.

4. Header displays:
   Claude
   Sonnet
   Account A

5. User works with Claude.

6. Messages are saved into the Master Conversation.

7. User changes provider from the same header.

8. Header now displays:
   ChatGPT
   Selected GPT Model
   Account B

9. Relevant Claude conversation context is handed to ChatGPT.

10. ChatGPT continues the task.

11. User does not manually copy the conversation.

12. All messages remain visible in one conversation.

13. Each response clearly records which provider generated it.
```

This is the core acceptance test for the entire product.

---

# 65. Product Priority

Development priority order:

**P0**

* Secure architecture
* Master Conversation
* Chat persistence
* Provider abstraction
* Provider switching
* Supabase
* Chat UI

**P1**

* Browser companion
* Claude integration
* ChatGPT integration
* project context
* attachments
* model selection

**P2**

* Gemini
* Perplexity
* Copilot
* multiple accounts per provider
* comparison mode

**P3**

* teams
* AI routing
* desktop application
* advanced analytics
* billing

---

# 66. Final Product Statement

Unified AI Workspace will provide one persistent workspace above individual AI providers.

Instead of organizing the user's work around a specific AI product, it organizes the work around:

**Projects → Conversations → Messages**

AI providers become interchangeable participants in those conversations.

The key product promise is:

**Start with one AI. Switch to another. Keep the same work.**
