# Agent output schemas

Use these schemas as the shared operating contract. When the dashboard provides a stricter `outputSchema`, follow the dashboard schema exactly.

## Crina

```json
{
  "workflowName": "Generate Weekly Content Plan",
  "generatedBy": "Crina",
  "weekStartDate": "YYYY-MM-DD",
  "summary": "string",
  "items": [
    {
      "id": "string",
      "brand_id": "string",
      "brandName": "string",
      "campaign_id": "string",
      "platform": "LinkedIn | X | Instagram | Facebook | Blog",
      "content_type": "string",
      "title": "string",
      "hook": "string",
      "body": "string",
      "CTA": "string",
      "assigned_agent": "string",
      "status": "idea | brief"
    }
  ]
}
```

## Competitor Intelligence Agent

```json
{
  "agent": "Competitor Intelligence Agent",
  "winningPatterns": [
    {
      "sourceLabel": "string",
      "hookSkeleton": "string",
      "audiencePromise": "string",
      "proofAngle": "string",
      "CTA": "string",
      "platformFit": "string",
      "whyItWorked": "string",
      "adaptFor": "string",
      "riskNotes": ["string"]
    }
  ],
  "recommendedAngles": ["string"],
  "handoffTo": "SEO Agent"
}
```

## SEO Agent

```json
{
  "agent": "SEO Agent",
  "brandName": "string",
  "searchObjective": "string",
  "keywordThemes": [
    {
      "theme": "string",
      "intent": "informational | commercial | navigational | transactional",
      "priority": "high | medium | low",
      "rationale": "string"
    }
  ],
  "serpAngles": ["string"],
  "blogBrief": {
    "title": "string",
    "targetKeyword": "string",
    "audience": "string",
    "outline": ["string"],
    "proofNeeded": ["string"],
    "internalLinks": ["string"],
    "cta": "string"
  },
  "technicalRecommendations": ["string"],
  "handoffTo": "Content Creator Agent"
}
```

## Content Creator Agent

```json
{
  "agent": "Content Creator Agent",
  "platform": "string",
  "drafts": [
    {
      "title": "string",
      "hook": "string",
      "body": "string",
      "CTA": "string",
      "variant": "primary | sharper | conservative",
      "claimsToReview": ["string"]
    }
  ],
  "visualOpportunities": ["string"],
  "status": "draft",
  "notes": "string"
}
```

## Visual & Video Agent

```json
{
  "agent": "Visual & Video Agent",
  "carouselConcepts": [
    {
      "title": "string",
      "slides": [
        {
          "slide": 1,
          "headline": "string",
          "visualDirection": "string",
          "supportingCopy": "string"
        }
      ]
    }
  ],
  "shortVideoScripts": [
    {
      "title": "string",
      "durationSeconds": 30,
      "beats": ["string"],
      "onScreenText": ["string"],
      "voiceover": "string"
    }
  ],
  "storyboardBriefs": ["string"],
  "assetNotes": ["string"]
}
```

## Publishing Agent

```json
{
  "agent": "Publishing Agent",
  "platform": "string",
  "draftPackage": {
    "title": "string",
    "body": "string",
    "formattedFor": "string",
    "hashtags": ["string"],
    "assetNotes": ["string"],
    "altText": "string"
  },
  "suggestedScheduleMetadata": {
    "suggestedTime": "string",
    "timezone": "Asia/Dubai",
    "reason": "string"
  },
  "readinessChecklist": ["string"],
  "published": false,
  "status": "draft"
}
```

## Analytics Agent

```json
{
  "agent": "Analytics Agent",
  "summary": "string",
  "dataQuality": "real | partial | mock | missing",
  "topContent": [
    {
      "title": "string",
      "reason": "string",
      "metricSignal": "string"
    }
  ],
  "weakContent": [
    {
      "title": "string",
      "reason": "string",
      "recommendedFix": "string"
    }
  ],
  "nextBestActions": ["string"],
  "handoffTo": "Crina"
}
```

