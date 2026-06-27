# food-api

Serverless API for the food app — recipe book, meal planning, and shopping list generation.

Built with AWS SAM, TypeScript, Lambda, DynamoDB, Cognito (phone/OTP), and S3.

## Commands

```bash
npm test        # run tests with coverage
npm run typecheck  # TypeScript check
npm run lint    # format + lint
npm start       # run locally via SAM
```

## Infrastructure

Deployed via AWS SAM. See `template.yaml` for resource definitions.
See `CLAUDE.md` for testing standards and module alias reference.
