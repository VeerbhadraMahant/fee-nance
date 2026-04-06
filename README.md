# Fee-Nance

Fee-Nance is an advanced personal finance and group expense management web app focused on financial clarity, strong data integrity, and practical real-world workflows.

## Project Direction
- Runtime database: MongoDB with Mongoose
- DBMS deliverables: SQL scripts folder for documentation mapping
- Authentication: Email/password + Google OAuth
- Currency: INR
- Budget cycles: Monthly, quarterly, yearly
- Recurring transactions: Monthly and yearly
- Group splits: Equal, custom, percentage
- Settlements: Manual with simplified pairwise balances

## MVP Features Implemented
### Personal finance
- Category management (system + custom)
- Transaction create/list with date filtering
- Budget create/list with cycle support
- Income/expense summary and balance calculation

### Group expense management
- Group creation with invite code
- Join group via invite code
- Multi-payer group expense recording
- Split validation enforcing total equality
- Balance computation per member
- Simplified pairwise settlement suggestions
- Manual settlement entries

### Authentication and security
- NextAuth credentials login
- Google OAuth (enabled when credentials exist)
- Protected dashboard and private API routes

## Architecture
- Frontend and backend: Next.js App Router
- Auth: NextAuth
- Data layer: Mongoose models
- Validation: Zod

## Tech Stack
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- MongoDB + Mongoose

## Setup
1. Install dependencies

npm install

2. Create local environment file
- Copy .env.example to .env.local
- Fill required values

3. Run development server

npm run dev

## Environment Variables
- MONGODB_URI
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET

## Demo Seed Data
Run:

npm run seed

Demo accounts:
- alex@feenance.demo / Demo@1234
- riya@feenance.demo / Demo@1234

## Main Routes
- / landing page
- /login sign in
- /register sign up
- /dashboard protected dashboard

## Notes
- Private APIs are under /api/private and are not publicly documented.
- sql-scripts is intentionally empty right now and reserved for DBMS documentation scripts.
