# Security Policy

We take the security of this personal portal and open-source codebase seriously. This document outlines our security policies and procedures for responsibly reporting potential vulnerabilities.

---

## Supported Versions

Security updates and patches are actively maintained for the following branches:

| Version / Branch | Supported          |
| ---------------- | ------------------ |
| `main` / `master` (production) | :white_check_mark: |
| Historical tags / commits      | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** open a public issue, pull request, or discussion. Public disclosure could expose sensitive services or user data before a fix is available.

### Preferred Channel: GitHub Private Vulnerability Reporting
Please use GitHub's native [Private Vulnerability Reporting](https://github.com/AndrewWangDev/My-Personal-Blog/security/advisories/new) feature to submit your advisory directly to the project maintainer.

### Alternative Channel: Direct Email
If you are unable to use the GitHub advisory tool, please email the maintainer directly:
* **Email**: [me@andrewwangdev.com](mailto:me@andrewwangdev.com)
* **Subject**: `[SECURITY VULNERABILITY] <Brief Description>`

### What to Include in Your Report
To help us investigate and reproduce the issue quickly, please include:
1. **Description**: A clear summary of the potential vulnerability.
2. **Impact**: Potential consequences if exploited (e.g., privilege escalation, session hijacking, information disclosure).
3. **Reproduction Steps**: Step-by-step instructions or a minimal Proof of Concept (PoC).
4. **Environment**: Relevant endpoints, headers, payload examples, or browser details.
5. **Mitigation**: Suggested fixes or patches, if available.

---

## Response & Disclosure Process

* **Acknowledgment & Triage**: We will review and acknowledge received security reports as quickly as practicable.
* **Assessment & Fix**: If verified, we will develop, test, and deploy a remediation patch directly to the production edge network and synchronize code branches.
* **Coordinated Disclosure**: Once the vulnerability is resolved and deployed, we will coordinate public disclosure through a GitHub Security Advisory and gladly credit your contribution (unless you prefer anonymity).
