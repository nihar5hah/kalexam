# KalExam

> **AI-Powered Exam Preparation** — Intelligent study tracking, adaptive learning pathways, and real-time readiness scoring.

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-Latest-orange?style=flat-square&logo=firebase)](https://firebase.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](./LICENSE)

---

## 🚀 Overview

**KalExam** transforms how students prepare for exams by combining intelligent content analysis with real-time progress intelligence. Upload your study materials (PDFs, Word docs, PowerPoints), get an AI-generated strategy, and let the platform guide you through personalized exam prep with live readiness scoring.

### Key Capabilities

- 📊 **Intelligent Strategy Generation**: AI analyzes your syllabus and study materials to create prioritized learning pathways
- 🎯 **Exam Mode Readiness**: Real-time scoring (0–100) with likely questions and weak area identification
- 💬 **Smart Chat Learning**: Contextual Q&A with cached responses to avoid redundant AI calls
- 📈 **Live Progress Tracking**: Per-topic learning status, time spent, and confidence scoring
- 🔥 **Next-Topic Recommendations**: Adaptive algorithms blend exam likelihood, priority, and time constraints
- 📄 **Strategy Report Export**: Download multi-page PDF reports with progress summaries
- ✍️ **Text + File Input**: Enter syllabus text manually or upload parsed documents

---

## 🏗️ Architecture Highlights

### Async Job Orchestration
Strategy generation runs as a multi-stage pipeline with immediate return and long-polling updates:
- **Stages**: Queued → Extracting → Analyzing → Generating → Preparing → Complete
- **No blocking**: Client polls `/api/generate-strategy/jobs` while precomputing top 3 recommended topics

### Session-Level Intelligence
- `TopicProgress` model tracks learning status, time spent, and confidence per topic
- Auto-marks topics as "learning" on first open, "completed" on finish
- Session caching prevents redundant LLM calls for identical queries

### Smart Recommendation Scoring
Six-factor algorithm for next-topic suggestions:
- Exam likelihood (0–100) + Chapter weightage (0–100)
- Unfinished bonus (18) + Priority score (10–35) + Time remaining factor (4–20)

### Exam Mode (Readiness 0–100)
- Generates 3 likely questions + weak areas + exam tip
- Adjusts readiness based on retrieval confidence (high +8, medium +3, low -5)
- Per-topic caching with model signature invalidation

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16.1, TypeScript, TailwindCSS, shadcn/ui |
| **Backend** | Next.js API Routes, Node.js |
| **Database** | Firestore (real-time progress, strategies, user sessions) |
| **Auth** | Firebase Authentication (email/password, OAuth) |
| **AI** | LLM integration (Gemini, OpenAI custom), RAG pipeline |
| **File Parsing** | pdf-parse, docx-parser, pptx-parser |
| **PDF Export** | jsPDF (client-side multi-page generation) |
| **Async** | In-memory job state machine (production: Cloud Tasks) |

---

## 🚄 Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Firestore enabled
- API keys for LLM providers (Gemini, OpenAI, or custom)

### Installation

```bash
# Clone the repository
git clone https://github.com/nihar5hah/kalexam.git
cd kalexam

# Install dependencies
cd frontend && npm install
cd ../backend && npm install

# Configure environment variables
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local
```

### Environment Setup

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
# Additional Firebase config
```

**Backend** (`.env.local`):
```
FIREBASE_PRIVATE_KEY=...
FIREBASE_PROJECT_ID=...
AI_PROVIDER=gemini  # or openai, custom
AI_API_KEY=...
```

### Local Development

```bash
# From frontend directory
npm run dev

# Runs on http://localhost:3000
```

### Build & Deploy

```bash
# Frontend build
cd frontend && npm run build

# Backend (if deploying separately)
cd backend && npm run build
```

---

## 📚 Core Features

### 1. Strategy Generation
Upload syllabus + study materials → AI analyzes chapters, topics, weightage → generates prioritized learning plan

```bash
POST /api/generate-strategy/jobs
{
  "syllabusFiles": [...],  // optional PDFs, DOCXs
  "syllabusTextInput": "...",  // optional manual text
  "studyMaterialFiles": [...]  // PDFs, DOCXs, PPTXs
}
```

### 2. Study Interface
Interactive topic page with:
- Contextual learning materials
- Chat Q&A (with caching)
- Completion tracking
- Auto-recommended next topic

```bash
GET /api/study/[topic]
POST /api/study/ask  // With cache invalidation
POST /api/study/exam-mode  // Get readiness score
```

### 3. Exam Mode
Test readiness before the actual exam:
- 3 likely questions generated from weak areas
- Real-time readiness score (0–100)
- Topic-level confidence scoring
- Exam preparation tips

### 4. Progress Intelligence
Every session tracks:
- Topics learned / completed / remaining
- Average time per topic
- Confidence scores (high/medium/low)
- Persistent session state across sessions

### 5. PDF Report Export
Download strategy as multi-page PDF including:
- Chapter summaries with weightage
- Material coverage per topic
- Progress badges (not started / learning / completed)
- Study recommendations

---

## 🔧 API Reference

### Generate Strategy
```http
POST /api/generate-strategy/jobs
Content-Type: application/json

{
  "syllabusFiles": ["file_id_1"],
  "syllabusTextInput": "Introduction to Chemistry...",
  "studyMaterialFiles": ["file_id_2"],
  "modelConfig": {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "temperature": 0.7
  }
}
```

**Response**:
```json
{
  "jobId": "job_abc123",
  "status": "queued"
}
```

### Poll Job Status
```http
GET /api/generate-strategy/jobs?id=job_abc123
```

**Response** (when complete):
```json
{
  "status": "complete",
  "result": {
    "chapters": [...],
    "topics": [...],
    "estimatedHours": 40
  }
}
```

### Chat with Context
```http
POST /api/study/ask
{
  "topic": "Organic Chemistry",
  "question": "What is a benzene ring?",
  "strategyId": "strategy_xyz"
}
```

### Get Exam Readiness
```http
POST /api/study/exam-mode
{
  "topic": "Organic Chemistry",
  "files": ["file_id_1"],
  "modelConfig": { ... }
}
```

**Response**:
```json
{
  "readinessScore": 72,
  "likelyQuestions": [
    "Define resonance in benzene...",
    ...
  ],
  "weakAreas": ["Substitution reactions"],
  "examTip": "Focus on mechanism steps..."
}
```

---

## 📊 Database Schema

### Firestore Collections

**`strategies/{strategyId}`**
- `chapters[]`: extracted from syllabus
- `topics[]`: generated topics with likelihood scores
- `createdAt`, `updatedAt`
- `userId`: user who created it

**`users/{uid}/studySessions/{sessionId}`**
- `strategyId`: associated strategy
- `topicProgress{}`: per-topic learning state
  - `status`: "not_started" | "learning" | "completed"
  - `timeSpent`: minutes
  - `confidenceScore`: 0–100
  - `lastOpenedAt`: timestamp
- `studyContent{}` (cache): generated summaries per topic
- `chatCache{}` (cache): Q&A responses with signature validation

---

## 🎯 Roadmap

### Phase 5: Production Readiness
- [ ] Migrate in-memory job store → Firestore + Cloud Tasks
- [ ] Dashboard analytics (exam countdown, high-risk topics, completion %)
- [ ] Enhanced PDF reports (student name, exam date, generated timestamp)
- [ ] Persistent session recovery

### Phase 6: Advanced Intelligence
- [ ] Spaced repetition scheduling
- [ ] Personalized mock exams
- [ ] Peer comparison (anonymized benchmarking)
- [ ] Study group collaboration

### Phase 7: Mobile & Offline
- [ ] React Native mobile app
- [ ] Offline study mode
- [ ] Push notifications for study reminders

---

## 🔒 Security & Privacy

- **Auth**: Firebase Authentication with UID-based access control
- **Data**: All student data in Firestore with user-scoped security rules
- **Files**: Uploaded materials stored in Firebase Storage with automatic cleanup
- **Models**: API keys stored in secure environment variables
- **Caching**: Session-level cache with cryptographic signature validation

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Write TypeScript for all new code
- Add tests for new features
- Follow ESLint + Prettier conventions
- Update README for API changes

---

## 💬 Support

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Join our community discussions
- **Email**: support@kalexam.com (placeholder)

---

## 👨‍💻 Authors

**Nihar Shah** — Full-stack AI engineer  
GitHub: [@nihar5hah](https://github.com/nihar5hah)

---

## ⭐ Show Your Support

If KalExam helped you ace your exams, please give this repo a ⭐! It helps others discover the project.

---

**Built with ❤️ for students everywhere. Ace your exams with intelligence.**
