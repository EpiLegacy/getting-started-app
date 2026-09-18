# **Audit report — getting-started-app**

**Deposit analyzed:** https://github.com/EpiLegacy/getting-started-app **Date of audit:**September 3, 2026 —*revision of September 9, 2026* **Method :**cloning the repository (branch)`main`), manual review of the source code, dependency analysis (`npm audit`), execution of a complete installation (`npm install`), review of the documentation and structure of the project.

---

## **1\. Executive Summary**

`getting-started-app is` a todo-list web application. It is a small Node.js / Express application with a static React frontend, an SQLite or MySQL database if configured, and a Jest unit test suite.

**Verdict global :**Several simple fixes would improve the reliability and security of the database, as well as the readability and scalability of the code. A move towards an event-driven architecture is also underway; this is discussed in section 7.8, along with its prerequisites.

| Domain | Status |
| ----- | ----- |
| Code architecture / readability | Difficult to maintain, needs improvement |
| Application coupling | Synchronous from end to end; transition to committed event-driven |
| Authentication | Absent |
| Application security (validation, injection) | Needs improvement |
| Dependencies (known vulnerabilities) | Existing vulnerabilities |
| Installation chain (lockfile, scripts) | Uncontrolled |
| Automated tests | Present but not usable as is |
| CI/CD | Absent |
| Documentation | Minimal |
| Governance (license, contribution) | Inconsistency detected |

---

## 

## **2\. Architecture et stack technique**

| src/├── index.js              \# Express Entry Point├── persistence/│   ├── index.js          \# Select SQLite or MySQL depending on the environment│   ├── sqlite.js│   └── mysql.js├── routes/│ ├── getItems.js│ ├── addItem.js│   ├── updateItem.js│   └── deleteItem.js└── static/                \# frontend React (non buildé, via \<script\>)spec/                      \# tests Jest (routes \+ persistence) |
| :---- |

The application is based on a simple monolithic architecture: a Node.js/Express server and a React interface. Data is stored in SQLite by default, or in MySQL when the environment variable`MYSQL_HOST`is defined.

### **2.1. Backend: Insufficient error handling**

The backend uses Express, declared in version`^5.2.1`with four routes for viewing, creating, modifying and deleting tasks.

The routes transmit the received data directly to the database, without validation of the name or the boolean.`completed`(cf. the function`updateItem()`) or the identifier. For example, a non-empty text value passed in`completed`will be converted to true by the storage layer. The responses do not explicitly distinguish certain situations: modifying a non-existent identifier does not produce a dedicated 404 response. No application middleware normalizes errors to JSON format.

The roads also call for the layer`persistence/`directly and synchronously, without an intermediate service layer. Any additional processing (notification, audit log, external synchronization) should currently be inserted into the HTTP request path. This point is a prerequisite for the evolution towards the event-driven architecture described in section 7.8.

**Areas for improvement:**Validate incoming HTTP requests, define expected responses for each operation, and centralize error handling. Extract a service layer between the routes and the persistence layer. Gradual adoption of TypeScript can then secure internal communication; it should complement the execution-based validation of received requests.

### **2.2. Database: schema integrity and configuration to be made reliable**

The application uses SQLite by default and MySQL when`MYSQL_HOST`is defined. These two engines do not operate simultaneously: the maintenance problem arises from the two adapters separately implementing the same SQL operations.

Each change to the model requires modifying both implementations and verifying their consistency. This duplication increases the risk of discrepancies between the environments: a feature validated under SQLite may behave differently under MySQL. As the schema and business rules become more complex, this dual maintenance becomes more costly and jeopardizes future development.

Other flaws compound this difficulty: absence of a primary key on`id`, lack of versioned migrations, task retrieval without pagination, and MySQL selection incompatible with a configuration based solely on`MYSQL_HOST_FILE`.

**Areas for improvement:**

Adopting an ORM and standardizing the database engine. Introducing an ORM is a key structural step towards centralizing the database model and operations. Combined with a version control migration system, it would allow for:

* **Reduce duplication**, by replacing the two implementations of current operations with a common access layer.  
* **Mastering the evolutions of the scheme**, with migrations tracked in Git and executed in a controlled manner.  
* **Strengthen data consistency**by explicitly declaring the keys, constraints, and relationships.  
* **Facilitate maintenance**by limiting the number of places to modify when a feature evolves.

This migration should be accompanied by the selection of a reference engine, for example MySQL, which is already present in the project and used in development, integration testing, and production. Retaining SQLite would only be justified by an explicit need, along with the additional testing that this support entails.

Add a primary key and useful constraints after checking existing data, introduce migrations and correct the reading as well as the selection of the MySQL configuration.

This project is also a technical prerequisite for event architecture: the motif of*transactional outbox*described in section 7.8 assumes reliable transactions and a single implementation, otherwise the publishing mechanism would also have to be maintained in duplicate.

### **2.3. Frontend: Compilation in the browser and unhandled network errors**

React, ReactDOM, React Bootstrap, and Babel are loaded from the project's static files, not from a CDN. Some libraries are already minified; the problem mainly concerns the application-level JSX, which is transformed in the browser with`type="text/babel"`without prior compilation. Babel advises against this approach for production.

This chain inherits obsolete dependencies: the installation reveals`core-js@1.2.7`, `core-js@2.6.12` And `popper.js@1.16.1`, all depreciated (see section 3.7).

The calls`fetch`do not check`response.ok`and do not handle failures. A deletion can therefore remove a task from the display even though the server has returned an HTTP error. A creation failure can also leave the interface in the "Adding..." state.

**Areas for improvement:**Check HTTP responses, display errors, and restore load states after a failure. Then, introducing a React build with Vite would allow compiling the JSX before deployment and producing production resources. Express could continue serving these files.

### **2.4. Execution and tooling: reproducibility needs improvement**

The project does not specify an expected Node.js version and only provides a development script using Nodemon. Jest tests are present, but Jest and the script`test`are not declared. No CI pipeline or linter is integrated.

Stopping the process closes the database without first shutting down the HTTP server and waiting for pending requests. The port is set to 3000, and no health endpoint is defined.

The installation observed on a development workstation confirms this lack of control over the environment: it was performed using an npm binary located in`C:\Windows\SysWOW64\`that is to say a**Installing 32-bit Node.js on a 64-bit system**The native modules (`sqlite3`, `@parcel/watcher`) are therefore compiled for an architecture that will not correspond to either the continuous integration agents or the production container.

**Areas for improvement:**specify the supported Node.js version via a field`engines`and a file`.nvmrc`Align the development workstation, CI/CD pipeline, and Docker image to the same version and architecture; add a production script; make the tests executable and automate their launch in CI/CD. Complete this foundation with a configurable port, health monitoring, and coordinated shutdown of the server and database.

---

## **3\. Applicative Security**

### **3.1. SQL Queries**

Databases (`sqlite.js`, `mysql.js`) systematically use parameterized queries (`?`\+ parameter table). No obvious SQL injection was found.

### **3.2. Lack of validation of entries**

None of the routes validate the content of`req.body`or`req.params` :

* `addItem.js` : `req.body.name`is used as is, without checking that it is indeed a non-empty string (a`undefined`or an arbitrary object can be stored).  
* `updateItem.js`same for`name` And `completed`.  
* `req.params.id`is never checked as a valid UUID before being used in queries.

### **3.3. Total absence of authentication / authorization**

All routes are open: anyone who can reach the server can read, create, modify, or delete items. No HTTP security headers are set, no CORS policy is defined, and no rate limiting is in place (see section 7.6).

### **3.4. Vulnerable dependencies (`npm audit`)**

The execution of`npm audit`on the`package-lock.json`the deposit initially showed**18 vulnerabilities (1 critical, 11 high, 3 moderate, 3 low)**, some of which affect direct dependencies. The majority of critical/high-risk vulnerabilities originate from the native compilation toolchain (`node-gyp`, `hide`, `make-fetch-happen`, `takes`, `mini-match`…) used by`sqlite3`during its installation, and not the code executed in production — their actual risk is therefore lower, but they increase the attack surface of the build/CI chain.

A subsequent execution of`npm install`goes back**25 vulnerabilities (1 critical, 17 high, 4 moderate, 3 low)**that is seven additional alerts, six of which are high level.

This difference does not necessarily reflect a degradation of the same dependency tree: the command has**Added 124 packages, removed 58 and modified 7**before proceeding with the audit (see section 3.5). The two measures therefore do not concern identical trees and are not directly comparable. Nevertheless, two conclusions are inescapable:

* the number of vulnerabilities must be recorded on a tree**reproducible** (`above sea level`on an up-to-date lockfile) before being considered a reliable tracking indicator;  
* The volume of alerts remains of the same order of magnitude, and the recommendation to update remains a priority.

Finally, it should be noted that the installation ends with a**exit code 0 despite a critical vulnerability**: no automatic safeguards are triggered today.

**Recommendation :** to update `mysql2` And `uuid`to their latest stable versions (with available patches), and add a step to the CI pipeline`npm audit --audit-level=high`blocking.

### **3.5. Lock file desynchronization**

And`npm install`on a healthy repository should not modify the dependency tree. Here, it adds 124 packages and removes 58: the`package-lock.json`versioned**is not consistent with the`package.json`**.

Direct consequences:

* two developers installing the project a few weeks apart do not obtain the same tree, which partly explains the difference in figures noted in section 3.4;  
* and`above sea level`in continuous integration — recommended command in section 5 — would fail on this discrepancy, which is the expected behavior but would block the pipeline until the file has been regenerated;  
* The security audit is based on a tree that is not the one that will be deployed.

**Area for improvement:**regenerate the`package-lock.json`, version it, and make`above sea level`the reference installation command.

### **3.6. Uncontrolled installation scripts (supply chain)**

The installation reports**five packages running installation or post-installation scripts**not yet authorized:

| Pack | Script | Probable origin |
| ----- | ----- | ----- |
| `sqlite3@5.1.7` | `install: node-gyp rebuild` | SQLite driver (section 7.3) |
| `@parcel/watcher@2.6.0` | `install: node-gyp rebuild` | development tools |
| `esbuild@0.28.2` | `postinstall: node install.js` | building tools |
| `core-js@2.6.12` | `postinstall: node -e ...` | legacy polyfills |
| `unrs-resolver@1.12.2` | `postinstall: node postinstall.js` | module resolution (ESLint chain) |

These scripts run with the privileges of the user who installs them, before any code review. This is the preferred vector for npm supply chain compromises: a compromised transitive package executes arbitrary code on the development machine.**and on CI agents**, where deployment secrets are often available. Two of them (`sqlite3`, `@parcel/watcher`) also trigger a native compilation via`node-gyp`, which corroborates the observation in section 3.4 regarding the weight of this chain in security alerts.

The warning`allow-scripts`indicates that the explicit authorization mechanism is active on this machine, but that**The list was never validated.**: the protection is in place but not being exploited.

**Areas for improvement:**to explicitly rule on these five packages (`npm approve-scripts`), version the authorization list in the repository so that it applies to the entire team, and run the CI installations with`--ignore-scripts`wherever native compilation is not required. The removal of`sqlite3`in favor of a driver managed by the ORM (sections 7.2 and 7.3) removes one of the two native compilation points.

### **3.7. Obsolete or abandoned dependencies**

The installation issues four depreciation warnings:

* **`nvm@0.0.4`**— npm itself indicates that this is not**not**from the Node version control system. It's a similarly named, abandoned package with no legitimate use here. Its presence in the tree most likely results from an incorrect installation (`npm install nvm`(instead of the official procedure). To be removed: an unused and unmaintained package only expands the attack surface.  
* **`core-js@1.2.7` And `core-js@2.6.12`**— Two major, obsolete versions coexist in the tree. The publisher reports web compatibility issues and slowdowns of up to a factor of 100 on these older versions. These issues stem from the Babel string used for transpilation in the browser, reinforcing the recommendation in section 7.5: a Vite build with a modern target renders these polyfills unnecessary.  
* **`popper.js@1.16.1`**— legacy version, replaced by`@popperjs/core`v2. Transitive dependency of React Bootstrap, it will disappear with the modernization of the frontend (section 7.5).

**Area for improvement:** DELETE `nvm`addictions, then treat`core-js` And `popper.js`through frontend migration rather than isolated updates.

---

## **4\. Code Quality and Testing**

The file`spec/`contains Jest tests covering routes (`addItem`, `deleteItem`, `getItems`, `updateItem`) and the SQLite layer. The tests are well-written (clean mocks, targeted assertions). However,`Is`does not appear in the`dependencies`nor in the`devDependencies` of `package.json`and there is no script`test`As it stands, a user who clones the repository and launches`npm test`gets an error, and`npm install`running the existing test suite alone is not possible.

There is no linter configured (no ESLint/Prettier), nor is there a static analysis configuration. No code coverage is measured.

Using JavaScript instead of TypeScript leads to a greater risk of errors when developing new features, due to the lack of typing.

**Point to check:**the presence of`esbuild`, `@parcel/watcher` And `unrs-resolver`The presence of tools in the installed tree suggests that static build and analysis tools may have been introduced since the initial draft. If these tools are indeed configured, the findings above and those in section 5 should be revised; if they are merely transitive dependencies without associated configuration, the finding remains valid and the tree contains unused tools.

---

## **5\. Continuous Integration / Deployment**

No GitHub Actions workflow (no folder)`.github/workflows`Therefore, no automatic checks (lint, tests, security audits) are performed on pull requests.

The minimum target pipeline includes:`above sea level`(and not`npm install`, in order to detect any desynchronization of the lockfile — section 3.5),`npm audit --audit-level=high`in a blocking step (section 3.4), and`npm test`once the test suite is made executable (section 4). The installations will be run there with`--ignore-scripts`where native compilation is not required (section 3.6).

---

## **6\. Documentation and Governance**

The`README.md`is very brief (3 lines): it refers to the Docker documentation but describes neither how to launch the app locally, nor the available environment variables (`MYSQL_HOST`, `SQLITE_DB_LOCATION`etc.), nor how to launch the tests.

The`package.json`mentions an MIT license without any files`LICENSE`The corresponding entry is not present in the repository. This inconsistency must be resolved.

---

## **7\. Technologies to be replaced or modernized**

This section identifies the current technological choices to be developed with a view to modernizing the project, based directly on the findings of the previous sections.

### **7.1. JavaScript → TypeScript**

**Observation related to the report:**Section 3.2 shows that nothing prevents`req.body.name`to be`undefined`, an arbitrary number or object; there is no guarantee of data format between the routes and the layer`persistence`.

**Why replace:**TypeScript adds a type-checking system at compile time. It would have detected, even before execution, inconsistencies such as passing a`name`undefined or of a`id`the bad type between`routes/` And `persistence/`It also facilitates maintenance for multiple developers (autocompletion, safe refactoring, implicit interface documentation).`Item`, `Db`etc). Migration can be done incrementally (`allowJs: true`progressive renaming of files`.js` in `.ts`) withoAut rewriting the application of a block.

### **7.2. Duplicate manual SQL queries → ORM (Prisma, TypeORM or Sequelize)**

**Observation related to the report:**Section 2.2 shows that`sqlite.js` And `mysql.js`reimplement the same queries twice (`getItems`, `getItem`, `storeItem`, `updateItem`, `removeItem`), with a risk of divergence if one is corrected without the other (already visible:`updateItem`differs slightly in formatting style between the two files).

**Why replace:**An ORM like Prisma eliminates this duplication: a single data schema, a single set of queries, and switching engines (SQLite ↔ MySQL) becomes a simple line of configuration instead of maintaining two parallel implementations. An ORM also provides schema migration management (currently absent — the`CREATE TABLE IF NOT EXISTS`(is done manually in the code), which is essential as soon as a schema evolves in production. It is also a prerequisite for the transactional outbox described in section 7.8.

### **7.3. `sqlite3` (pilote natif, callback-based) → `better-sqlite3`or ORM integrated driver**

**Observation related to the report:**Sections 3.4 and 3.6 identify that the majority of high/critical vulnerabilities (`takes`, `node-gyp`, `hide`, `make-fetch-happen`) come from the native compilation chain used by`sqlite3`, not the application code itself, and that this package is one of two to trigger a`node-gyp rebuild`to the installation.

**Why replace:** `better-sqlite3`It has a simpler synchronous API, a lighter dependency chain, and a more active maintenance history, directly reducing the alert surface area.`npm audit`related to the native build. If an ORM is adopted (see 7.2), this point is de facto resolved since the ORM itself manages the database driver.

### **7.4. Validation missing → schema library (Zod or Joi)**

**Observation related to the report:**section 3.2, no validation of`req.body` / `req.params`on no road.

**Why replace:**A library like Zod (ideal with TypeScript, as it automatically infers types from the validation schema) or Joi would allow for the clean rejection (HTTP 400\) of any malformed request before it reaches the layer`persistence`, instead of silently allowing invalid data to pass through as is currently the case. The same schemes will be reusable for validating event payloads (section 7.8).

### **7.5. Frontend React \+ Babel navigateur → build moderne (Vite \+ React, en TypeScript)**

**Observation related to the report:**Section 2.3, the frontend loads React and Babel via tags`<script>`and transpiles the JSX directly into the browser, without a build step; section 3.7 shows that this chain carries deprecated dependencies (`core-js@1`, `core-js@2`, `popper.js@1`).

**Why replace:**This approach is not suitable for a real-world product: transpilation on every page load (degraded performance), no minification, no bundle splitting, no tree-shaking, and no type checking on the front end. Migrating to Vite (or Next.js if server-side rendering is desired) with a TypeScript \+ React base would provide reduced load times, modern development tools (hot reload, built-in lint), the elimination of obsolete polyfills, and language consistency with a backend that has itself migrated to TypeScript.

### **7.6. Missing security middleware → Helmet, CORS, rate-limiting**

**Observation related to the report:**section 3.3, no HTTP security header, no CORS policy, no rate limiting.

**Why add:** `helmet`automatically positions basic security HTTP headers (XSS protection,`X-Frame-Options`, etc.), `cors`allows you to explicitly restrict the origins authorized to call the API, and`express-rate-limit`It limits abuse (brute force, application denial of service). These are inexpensive but essential additions as soon as an API is exposed beyond local use.

### **7.7. Jest test suite unusable → full Jest configuration \+ Supertest**

**Observation related to the report:** section 4, `Is`is not stated anywhere in`package.json`and no script`test`does not exist.

**Why add more?**beyond the simple declaration of`Is`As a dependency, adding Supertest would allow existing unit tests to be supplemented with HTTP integration tests (real requests on Express routes), giving coverage more faithful to the real behavior of the API — particularly useful once input validation (7.4) and ORM (7.2) are in place.

### **7.8. Direct synchronous calls (routes → persistence) → event-driven architecture**

**Observation related to the report:**Section 2.1 shows that the four routes directly call the layer`persistence/`Synchronously, without a service layer. Any additional processing—notifications, audit logs, statistics, synchronization with another system—would currently have to be added to the HTTP request path, increasing response time and coupling each new requirement to the routing code. Furthermore, no history of state changes is maintained: the database only contains the current state of the tasks.

**Why evolve?**An event-driven architecture decouples producers of state changes from the consumers that react to them. Specifically, for this project:

* **Extensibility**Adding a consumer (notifications, export, search, client webhook) no longer requires modification`addItem.js`, `updateItem.js`or`deleteItem.js`.  
* **Resilience**: an unavailable consumer no longer invalidates the main write; events are retried from the queue instead of causing the user request to fail.  
* **Traceability**: the event stream constitutes a log of state changes, usable as an audit trail — currently non-existent.  
* **Response time**Secondary processing is outside the HTTP request/response cycle.

#### **Implementation**

**Definition of events.**Named in the past tense and versioned:`ItemCreated`, `ItemUpdated`, `ItemCompleted`, `ItemDeleted`Each event has an explicit schema (event ID, task ID, timestamp, version, payload). The Zod schemas introduced for HTTP validation (section 7.4) are reusable for validating published and consumed payloads, thus avoiding two divergent definitions.

**Publication layer.**Events should not be published from routes but from a service layer inserted between them.`routes/` And `persistence/`(section 2.1). This extraction is a structural prerequisite, and it also benefits the tests (section 7.7).

**Consistency between writing and publication.**Writing to the database and then publishing later exposes the user to two symmetrical failures: an event published without being written, or a write without being written. The reason*transactional outbox*deals with this point — the event is inserted into a table`outbox`Within the same transaction as the business logic entry, a relay reads this table and publishes. This pattern assumes reliable transactions, thus reinforcing the need for a single ORM and a single reference engine (sections 2.2 and 7.2): maintaining the outbox in duplicate in`sqlite.js` And `mysql.js`would reproduce exactly the duplication that section 2.2 recommends removing.

**Consumption.**The delivery is*at-least-once*Consumers must be idempotent, relying on the event identifier to ignore replays. Provide a reject queue (*dead-letter queue*) for messages that repeatedly fail.

**Bus selection.**Redis Streams or NATS are sufficient to get started. RabbitMQ or Kafka are only justified if long retention and historical replay become real needs.

**Frontend.**Refreshment by`fetch`This can evolve towards a push update (SSE or WebSocket) driven by events. This evolution assumes that the network error handling described in section 2.3 has been corrected first.

**Observability.**Correlation identifier propagated from the HTTP request to consumers, monitoring of consumption latency and queue depth.

#### **Recommended trajectory**

1. Extract the service layer and define the event catalog, with a publication**in-process**behind an interface (the bus remains an implementation detail).  
2. Introduce the transactional outbox once the ORM and the single engine are in place.  
3. Outsource to a broker when a first consumer outside the process actually exists.  
4. Add projections and real-time streaming to the interface.

This progression makes it possible to fix the boundaries of the event-based model now without immediately bearing the operating cost of a broker.

#### **Prerequisites and points to consider**

Event-driven architecture should not precede the blocking fixes identified in section 8: distributing unvalidated (section 3.2) and unauthenticated (section 3.3) data to multiple consumers is tantamount to propagating the problem instead of resolving it. The prerequisites are therefore, in order: authentication, input validation, executable test suite and CI pipeline, then ORM and a unified engine.

Points to consider: long-term consistency (the interface may display a slightly different state), broker operating costs, more complex distributed debugging, and more extensive integration testing. For an application of this size, the benefit depends directly on the number of consumers and integrations actually planned in the medium term.

### **7.9. Uncontrolled installation →`above sea level`, up-to-date lockfile and explicitly authorized scripts**

**Observation related to the report:**sections 3.5, 3.6 and 3.7 — an out-of-sync lockfile, five packages running code on installation without validation, and abandoned dependencies present in the tree.

**Why change?** `above sea level`It installs exactly what the lockfile describes and fails if there is a deviation, making installations reproducible across workstations, CI, and production. Explicit validation of the list`allowScripts`Versioned in the repository, this transforms an ignored warning into an effective control. Finally,`--ignore-scripts`CI eliminates the main vector for arbitrary code execution during automated installations.

### **Summary table**

| Current technology | Recommended replacement | Main benefit |
| ----- | ----- | ----- |
| JavaScript | TypeScript | Type security, fewer runtime bugs, better maintainability |
| Duplicate manual SQL queries (`sqlite.js` / `mysql.js`) | ORM (Prisma / TypeORM) | Elimination of duplication, schema migrations, multi-DBMS portability |
| `sqlite3` (natif, callback) | `better-sqlite3`or pilot managed by the ORM | Reduction of vulnerabilities related to the native build chain |
| No entry validation | Zod / Thursday | Proper rejection of invalid queries, type consistency |
| React \+ Babel browser | Build Vite/Next.js \+ TypeScript | Performance, modern tooling, elimination of obsolete polyfills |
| No HTTP security middleware | Helmet \+ CORS \+ rate-limit | Basic hardening against common web attacks |
| Jest is not configured | Jest \+ Supertest, script`test`declared | A truly executable test suite, unit coverage \+ integration |
| Direct synchronous route calls → persistence | Event architecture (business events, transactional outbox, bus) | Decoupling, extensibility, resilience, traceability of state changes |
| Installation not reproducible, scripts not checked | `above sea level`on lockfile up to date,`allowScripts` valid, `--ignore-scripts`in Ivory Coast | Reproducible installations, reduced risk of supply chain compromise |

---

## **8\. Recommendations**

### **High priority**

1. Implement authentication/authorization before any exposure beyond local use.  
2. To update `mysql2` And `uuid`towards the corrected versions (direct exploitable vulnerabilities).  
3. Regenerate and version the`package-lock.json`then impose`above sea level`as a reference installation command (section 3.5).  
4. Explicitly validate the list of allowed installation scripts and version it; run CI installations with`--ignore-scripts`where native compilation is unnecessary (section 3.6).  
5. Add `Is` to `devDependencies`and a script`"test": "is"`to make the existing test suite actually usable.  
6. Set up a simple CI workflow (GitHub Actions):`above sea level`, `npm audit --audit-level=high`blocking,`npm test`on each pull request.  
7. Add a file`LICENSE`consistent with the MIT mention of`package.json`.

### **Medium priority**

1. Migrate to TypeScript (section 7.1) to secure the typing of data exchanged between routes and database.  
2. Introduce an ORM (section 7.2) to eliminate SQLite/MySQL duplication and manage schema migrations.  
3. Add input validation via Zod/Joi (section 7.4).  
4. Prepare the event architecture: extract a service layer, define the business event catalog and their schemas, with in-process publishing initially (section 7.8).  
5. Remove the dependency`nvm`(discontinued homonymous package, no longer in use) (section 3.7).  
6. To announce `engines` And `.nvmrc`and align development, CI and production environments (section 2.4).  
7. Add the Helmet / CORS / rate-limit security middlewares (section 7.6).  
8. Expand the README: local launch instructions (with/without Docker), environment variables, test command.  
9. Reassess vulnerabilities on a reproducible tree before using it as a monitoring indicator (section 3.4).

### **Low priority / optional**

1. Migrate the frontend to a modern build using Vite/Next.js \+ TypeScript (section 7.5).  
2. Set up the transactional outbox and then externalize the bus to a broker, once the ORM is in place and an out-of-process consumer is identified (section 7.8).  
3. Replace the refresh with`fetch`by real-time streaming (SSE/WebSocket) powered by events (section 7.8).  
4. Replace `sqlite3`about`better-sqlite3`if the adoption of an ORM is not retained in the short term (section 7.3).  
5. Complete the test suite with Supertest for HTTP integration testing (section 7.7).

---

## **9\. Conclusion**

This project is not ready for production in its current state. The codebase is clean and well-structured, but several shortcomings pose real risks once the application moves beyond a demonstration environment:

* **Complete lack of authentication and authorization**Any user with access to the network can read, create, modify, or delete everyone else's data. This is the most critical stumbling block before any opening to real users.  
* **Uncorrected vulnerable addictions** (`mysql2`, `uuid`in particular), including a vulnerability that could expose database login credentials in plain text — unacceptable for a system managing user accounts or data.  
* **Uncontrolled installation chain**The lockfile was out of sync, five packages executed arbitrary code during installation without validation, and an installation completed successfully despite a critical vulnerability. The exposure surface is therefore not limited to code executed in production: it includes development workstations and CI agents.  
* **No server-side input validation**This exposes the application to corrupted data or unexpected behavior once integrated into a larger system.  
* **Lack of CI/CD and usable tests**: without an automated pipeline, each code evolution presents a risk of regression or reintroduction of vulnerabilities, which is difficult to detect before production deployment.  
* **Outdated technological choices for a business context**(Untyped JavaScript, duplicated SQL queries without ORM, frontend without build): viable for a demonstration, but costly in maintenance and reliability as soon as the team or codebase grows.  
* **End-to-end synchronous coupling**Each route writes directly to the database, without a service layer or state change log. The transition to an event-driven architecture is underway; it must occur after the database is secured and rely on the ORM and single engine recommended in section 2.2, otherwise the SQLite/MySQL duplication would propagate to the event publishing mechanism.  
* **Insufficient documentation and governance**(Minimal README, inconsistency on the license): a hindrance to maintainability and onboarding of new contributors on a project intended to last.

**General recommendation:**Before any deployment, it is essential to prioritize authentication, updating vulnerable dependencies, ensuring the reliability of the installation pipeline, validating inputs, and setting up a CI pipeline. In the medium term, migrating to TypeScript and introducing an ORM remain the two priority technological developments; they also determine the implementation of the event-driven architecture planned for the future.

