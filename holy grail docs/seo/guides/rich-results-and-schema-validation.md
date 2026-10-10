# Rich Results Test and Schema Markup Validator

Structured data is JSON-LD in the page that describes what the page is: an organization, a website, a piece of software, a breadcrumb trail. Two free tools check it, and they answer different questions:

- **[Rich Results Test](https://search.google.com/test/rich-results)** (Google): is this markup eligible for a Google search feature, and does it have errors that block that feature?
- **[Schema Markup Validator](https://validator.schema.org/)** (schema.org): is this markup valid schema.org, regardless of what any search engine does with it?

Run both after any change to `frontend/apps/marketing/src/lib/seo/structured-data.ts`.

## What actrone.com emits

| Page | Types | What it does |
| --- | --- | --- |
| Every page | `Organization` | Ties the site to the brand name, logo, GitHub organisation and X profile |
| Homepage | `WebSite` | Helps Google choose "Actrone" as the site name shown above results |
| Homepage | `SoftwareApplication` | Describes Actrone Memory as a free developer application |
| Homepage | `SoftwareSourceCode` (2) | Links each library to its repository, language and MIT license |
| 6 docs guides | `BreadcrumbList` | Shows "actrone.com › Docs › Memory" instead of a raw URL in results |

Only the breadcrumbs produce a visible rich result. The other types feed Google's understanding of the brand and site name. They won't show a badge in the Rich Results Test, which is expected.

## Test a deployed page

1. Open the [Rich Results Test](https://search.google.com/test/rich-results).
2. Enter `https://actrone.com/docs/memory/configuration` and run the test.
3. Pass condition: **Breadcrumbs** listed as a valid item, with 3 entries (Docs, Memory, Memory configuration) and no errors.
4. Repeat with `https://actrone.com/`. Pass condition: the page is crawlable and there are no errors. A "No items detected" result is fine here, because the homepage types aren't rich-result types.

## Test before deploying

Both tools accept pasted code:

1. Build and start the site locally.
2. Open the page, view source, and copy the whole HTML.
3. In either tool, choose the **Code** option and paste.

## Validate every type

The Rich Results Test only reports types Google supports as rich results. Use the Schema Markup Validator to check `WebSite`, `SoftwareApplication` and `SoftwareSourceCode` too:

1. Open the [Schema Markup Validator](https://validator.schema.org/) and enter `https://actrone.com/`.
2. Pass condition: 0 errors across all detected items. Warnings about optional properties are acceptable.

## Rules for changing structured data

- **Only mark up what the page shows.** Google treats markup that describes content not visible on the page as spam.
- **Don't add ratings.** `SoftwareApplication` rich results need `aggregateRating` or `review`. The site has neither, and inventing them violates Google's guidelines and could bring a manual action.
- **Don't add FAQ markup.** Google stopped showing FAQ rich results and removed the documentation in 2026 ([Search Central updates](https://developers.google.com/search/updates)).
- **Keep URLs absolute and live.** Every `url`, `logo` and `item` must return 200. `src/test/seo.test.ts` checks that the logo file ships.
- **Reference the organization by `@id`.** Types link to `https://actrone.com/#organization` rather than repeating the organization's details.

## Routine

- **Pre-launch**: both tools on the homepage and one docs page
- **After any structured data change**: both tools before merging
- **Monthly**: the Enhancements section of Search Console, which reports breadcrumb errors across all pages
