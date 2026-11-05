# Contributing to AndrewWangDev Portal

Thank you for your interest in contributing! Whether you are reporting a bug, proposing a new feature, or submitting code improvements, we welcome and appreciate your support.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please ensure interactions remain respectful, inclusive, and professional.

---

## Getting Started

### Prerequisites
* **Node.js**: `v22.x` or higher
* **npm**: `v10.x` or higher
* **Cloudflare Wrangler**: Installed via project devDependencies (`npx wrangler`)

### Local Setup
1. **Fork and Clone** the repository:
   ```bash
   git clone https://github.com/<your-username>/My-Personal-Blog.git
   cd My-Personal-Blog
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Initialize Local Cloudflare D1 Database**:
   ```bash
   npx wrangler d1 execute DB --local --file=schema.sql
   ```

4. **Start the Local Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## Development & Testing Workflow

### Verification before Submission
Before pushing changes or submitting a Pull Request, always verify that the project builds without errors:
```bash
npm run build
```
This triggers Astro's TypeScript compilation, asset bundling, and Cloudflare Worker entry point verification.

### Git Commit Guidelines
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
* `feat:` A new feature or user-facing enhancement
* `fix:` A bug fix
* `security:` A security vulnerability fix or authentication hardening
* `docs:` Documentation changes only
* `refactor:` Code refactoring without changing observable behavior
* `perf:` A code change that improves performance
* `chore:` Build scripts, dependency updates, or internal tooling changes

Example:
```bash
git commit -m "fix(auth): enforce strict session token version verification in middleware"
```

---

## Submitting a Pull Request

1. Create a new topic branch from `main`:
   ```bash
   git checkout -b fix/your-issue-or-feature
   ```
2. Make clean, focused commits with meaningful commit messages.
3. Ensure `npm run build` passes with zero errors.
4. Push your branch to your fork:
   ```bash
   git push origin fix/your-issue-or-feature
   ```
5. Open a Pull Request against `main`. Fill out all relevant sections in the PR template.
6. Note: Maintainers will ensure changes are mirrored across both `main` and `master` branches upon merging.

---

## Questions and Support

* For general questions and architecture discussions, join [GitHub Discussions](https://github.com/AndrewWangDev/My-Personal-Blog/discussions).
* For reproducible bugs or feature ideas, please open an issue using the appropriate [Issue Template](https://github.com/AndrewWangDev/My-Personal-Blog/issues/new/choose).
* For private security reports, please refer to [SECURITY.md](SECURITY.md).
