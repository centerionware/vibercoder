# VibeCode CORS Proxy

This directory contains the source code for a minimal, open-source CORS (Cross-Origin Resource Sharing) proxy.

## Why is this needed?

For security reasons, web browsers prevent code running on one website (like VibeCode) from making network requests to another domain (like `github.com`). This is called the Same-Origin Policy.

GitHub's servers do not include the necessary CORS headers to allow direct access from a browser-based application.

This proxy acts as a simple, secure bridge. You deploy it to your own cloud account, and it forwards your requests to GitHub while adding the required CORS headers to the response. This allows VibeCode's in-browser Git client (`isomorphic-git`) to function correctly.

**Security:** Because you deploy this proxy to your **own account**, your Git credentials and repository data are never seen by or passed through VibeCode's servers. You are in complete control.

## One-Click Deployment

Click one of the buttons below to deploy this proxy to your own serverless account for free.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpath-to-your-template-repo)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2Fpath-to-your-template-repo)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fpath-to-your-template-repo)

*(Note: The repository URLs above are placeholders and will be updated once the template repository is created.)*

## Setup Instructions

1.  **Deploy:** Click one of the "Deploy" buttons above and follow the instructions on the provider's website. You will be asked to sign in to your account (or create a new one) and give the new project a name.
2.  **Get the URL:** After deployment is complete, the provider will give you a URL for your new proxy function (e.g., `https://my-proxy-project.vercel.app` or `https://my-proxy.workers.dev`).
3.  **Configure VibeCode:** Copy this URL. Go to the **Settings** view in VibeCode, find the "Git Connection (CORS Proxy)" section, and paste your URL into the "Deployed Proxy URL" field.
4.  **Save:** Click "Save All Settings".

You are now ready to use Git inside VibeCode!
