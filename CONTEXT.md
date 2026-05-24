# SubQ Context

SubQ is a health tracking context for subcutaneous injection management. This file names the domain terms that should shape module seams, tests, UI copy, and architecture reviews.

## Language

### Injection Tracking

**Injection**:
A single administered dose of a **drug**, at a specific time, optionally at an **injection site** and optionally associated with an **injection schedule**.
_Avoid_: Shot, dose event, administration event.

**Injection Log**:
The user's recorded history of **injections**. An **injection log** belongs to one user and may reference one **injection schedule**.
_Avoid_: Journal entry, shot history, injection record.

**Schedule Assignment**:
The act of linking or unlinking one or more **injection logs** to an **injection schedule**. Bulk assignment is the same concept applied to multiple logs.
_Avoid_: Link logs, attach to schedule, bulk assign when naming the domain action.

**Injection Site**:
The body location used for an **injection**, such as left ventrogluteal or right deltoid. Site rotation uses this term when reasoning about prior sites.
_Avoid_: Location, spot, body site.

**Site Rotation**:
The ordered sequence used to suggest the next **injection site** from the last known site. Site rotation is advisory and should not rewrite the user's recorded site.
_Avoid_: Site helper, next site, rotation list.

**Off-Schedule Dosage**:
A dosage entered for a schedule-associated **injection** that does not match any dosage in that schedule's **titration phases**. It requires explicit user confirmation before logging.
_Avoid_: Custom dose, invalid dose, mismatch warning.

### Schedule Cadence

**Injection Schedule**:
A prescribed injection regimen for one **drug**. An **injection schedule** has one **frequency**, one start date, and one or more ordered **titration phases**.
_Avoid_: Protocol, plan, regimen, calendar.

**Active Injection Schedule**:
The **injection schedule** currently used for next-dose and reminder calculations. Treat this as singular unless the product explicitly supports multiple active schedules.
_Avoid_: Current plan, selected schedule.

**Injection Schedule Cadence**:
The behavior that turns a schedule's **frequency**, start date, prior injections, and **titration phases** into due dates, current phase placement, expected injection counts, and schedule labels.
_Avoid_: Frequency helper, date helper, schedule utility.

**Frequency**:
The recurrence interval for an **injection schedule**, currently daily, every 3 days, weekly, every 2 weeks, or monthly. Monthly currently means a 30-day interval, not a calendar month.
_Avoid_: Interval, repeat, cadence when only naming the literal value.

**Titration Phase**:
One ordered step inside an **injection schedule**, with its own dosage and optional duration in days. Multiple phases describe dosage changes over time.
_Avoid_: Step, stage, month.

**Maintenance Phase**:
A **titration phase** with no planned end date. In storage this is represented as `durationDays = null`.
_Avoid_: Indefinite phase, ongoing phase, final phase.

**Titration Phase Status**:
The placement of a **titration phase** within schedule progress: completed, current, or upcoming.
_Avoid_: Phase state, status badge.

**Schedule Period**:
The date span covered by an **injection schedule** or one of its **titration phases**. A maintenance phase makes the ending date open-ended.
_Avoid_: Active period, date range when referring to schedule meaning.

**Schedule View**:
A progress read model for an **injection schedule**, including phase periods, phase statuses, expected and completed injection counts, and assigned injections.
_Avoid_: Schedule details, schedule page model.

**Next Scheduled Dose**:
The next recommended injection produced by the **injection schedule cadence** for the active schedule. It includes the suggested date, dosage, current phase, days until due, and overdue status.
_Avoid_: Next shot, next reminder, upcoming dose.

**Quick Log**:
Creating an **injection log** directly from the **next scheduled dose**, using the suggested dosage, drug, schedule, and next site from **site rotation**.
_Avoid_: Fast entry, one-click log.

**Due Day**:
The calendar day on which the **next scheduled dose** is due. Reminders are sent on due days and recent overdue days.
_Avoid_: Shot day, reminder day.

**Reminder**:
An email notification derived from the **next scheduled dose**. A reminder is not itself the dose or the source of cadence truth.
_Avoid_: Alert, notification when naming domain modules.

**Overdue Reminder Window**:
The recent-overdue range where a **reminder** may still be sent after the due day. The current window is 7 days overdue.
_Avoid_: Grace period, stale reminder cutoff.

**Schedule Inference From Injection Logs**:
Creating a draft **injection schedule** from selected **injection logs** by grouping dosage changes over time, then applying **schedule assignment** after creation.
_Avoid_: Auto-create schedule, infer phases when naming the full flow.

### Medication Vocabulary

**Drug**:
The substance being injected or tracked in inventory, such as semaglutide, tirzepatide, testosterone cypionate, or a compounded variant.
_Avoid_: Medication, compound, product when naming code modules.

**GLP-1 Drug**:
A **drug** in the GLP-1 tracking set, such as semaglutide, tirzepatide, retatrutide, liraglutide, or dulaglutide.
_Avoid_: Medication category, GLP1 option.

**Drug Variant**:
A user-selectable **drug** label that combines the active substance with a branded or compounded qualifier, such as `Semaglutide (Ozempic)` or `Tirzepatide (Compounded)`.
_Avoid_: Medication option, brand string.

**Drug Source**:
Where a **drug** came from, such as a pharmacy, manufacturer, or supplier.
_Avoid_: Provider, vendor, manufacturer unless specifically narrower.

**Dosage**:
The amount administered in an **injection** or assigned to a **titration phase**. Dosage is user-entered text because units vary across drugs and sources.
_Avoid_: Dose when naming persisted fields.

**Drug Vocabulary**:
The shared catalog of known **drugs**, suggested dosages, form compatibility, and site-rotation defaults. This should be one source of truth when those choices need to be reused.
_Avoid_: Medication vocabulary, GLP-1 list, drug options.

### Inventory

**Inventory Item**:
A single vial or pen of a **drug** that the user has on hand. Inventory tracks source, form, total amount, status, and optional beyond-use date.
_Avoid_: Supply, stock, container.

**Active Inventory Item**:
An **inventory item** whose status is not finished and can still be used in injection flows.
_Avoid_: Available item, usable inventory.

**Inventory Stack**:
A display grouping of identical **inventory items** with the same drug, source, form, total amount, status, and beyond-use date.
_Avoid_: Group, duplicate set, quantity group.

**Inventory Form**:
The physical form of an **inventory item**, currently vial or pen.
_Avoid_: Drug type, packaging.

**Inventory Status**:
The lifecycle state of an **inventory item**: new, opened, or finished.
_Avoid_: Item state, availability.

**Total Amount**:
The full amount contained in one **inventory item**, such as `10mg` in a vial or `2.5mg` in a pen. This is not the same thing as an injection **dosage**.
_Avoid_: Dosage, amount, quantity.

**Beyond-Use Date**:
The date after which a compounded **inventory item** should not be used.
_Avoid_: Expiration date unless the source explicitly provides an expiration date.

### Weight And Goals

**Weight Log**:
A single weight measurement at a specific time. Weight is stored internally in pounds and converted for display/input based on user settings.
_Avoid_: Weigh-in, weight record.

**Weight Unit**:
The user's display and input preference for weight, currently pounds or kilograms. Stored weights remain pounds regardless of this preference.
_Avoid_: Unit setting, display unit when naming domain behavior.

**User Goal**:
The user's target weight with a starting weight, starting date, optional target date, and active/completed state. Only one goal should be active at a time.
_Avoid_: Target, milestone, objective.

**Goal Progress**:
A projection summary for a **user goal**, including current weight, pounds lost, percent complete, projected date, pace status, days on plan, and average pounds per week.
_Avoid_: Progress card, forecast.

**Pace Status**:
The **goal progress** label comparing current weight-loss rate against the target date: ahead, on track, behind, or not losing.
_Avoid_: Goal status, progress status.

**Weight Trajectory**:
The trend behavior derived from **weight logs** and used for stats and **goal progress**. This includes regression, rate per week, trend line, and projection inputs.
_Avoid_: Trend helper, regression utility, chart math.

### Stats And Patterns

**Dosage History**:
The chronological dosage pattern derived from **injection logs**, grouped by drug and parsed into numeric dosage values for charting.
_Avoid_: Dose chart, dosage trend.

**Observed Injection Frequency**:
The actual injection pattern derived from **injection logs**, including average days between injections, injections per week, and most common injection day.
_Avoid_: Frequency, cadence, schedule frequency.

**Injection Site Distribution**:
The count of **injections** by recorded **injection site** over a selected period.
_Avoid_: Site stats, site chart.

**Drug Breakdown**:
The count of **injections** by **drug** over a selected period.
_Avoid_: Drug stats, medication breakdown.

**Day-of-Week Injection Pattern**:
The count of **injections** by local calendar day of week. Day-of-week stats use the user's timezone, not UTC.
_Avoid_: Weekday chart, injection by day.

### Preferences

**User Settings**:
Per-user preferences that affect presentation or optional behavior, currently **weight unit** and **reminder preference**.
_Avoid_: App settings when referring to persisted user data.

**Reminder Preference**:
The **user setting** that controls whether **reminders** are eligible to be sent. Missing settings default to reminders enabled.
_Avoid_: Notification toggle, email setting.

### Portability

**Data Export**:
A versioned portable snapshot of a user's weight logs, injection logs, inventory, schedules, goals, and settings.
_Avoid_: Backup, dump.

**Data Import**:
The process of restoring a **data export** into SubQ and reporting imported counts by entity type. Current import behavior replaces the user's existing data rather than merging with it.
_Avoid_: Restore, upload when naming domain behavior.

## Flagged Ambiguities

**Drug vs medication**:
Code uses `DrugName`, while product language may say medication. Use **drug** in domain modules and tests. Use medication only in user-facing prose when it reads better.

**Drug vs drug variant**:
Use **drug** for the general concept. Use **drug variant** when the active substance and branded/compounded qualifier are both significant.

**Frequency vs cadence**:
Use **frequency** for the literal recurrence value. Use **injection schedule cadence** for the deeper behavior that interprets frequency with dates, phases, prior injections, and labels.

**Schedule frequency vs observed injection frequency**:
Use **frequency** or **schedule frequency** for prescribed recurrence. Use **observed injection frequency** for stats derived from actual injection logs.

**Maintenance phase vs indefinite phase**:
Use **maintenance phase** in domain language. `durationDays = null` is the storage representation, not the concept name.

**Due day vs reminder day**:
Use **due day** for schedule math. A **reminder** happens because a due day was calculated; it should not own due-date semantics.

**Reminder vs reminder preference**:
Use **reminder** for the email notification. Use **reminder preference** for the user setting that gates reminder eligibility.

**Schedule association for injection logs**:
An **injection log** may reference an **injection schedule**, but some cadence flows also match prior injections by **drug**. New schedule behavior should state explicitly which relationship it relies on.

**Active schedule vs active inventory**:
An **active injection schedule** means the schedule used for cadence. An **active inventory item** means an inventory item whose status is not finished.

**Dosage vs total amount**:
Use **dosage** for the amount administered in an injection or phase. Use **total amount** for the contents of one inventory item.

**Data import vs merge**:
Use **data import** for the current replacement behavior. Do not imply merge semantics unless that behavior is added explicitly.

## Example Dialogue

Developer: When a user has an active injection schedule for tirzepatide, what decides whether we email them today?

Domain expert: The injection schedule cadence decides the due day from the schedule frequency, start date, last injection, and current titration phase.

Developer: So the reminder service should not calculate frequency rules itself?

Domain expert: Correct. A reminder only consumes the next scheduled dose and decides whether to send an email.

Developer: If the final phase has no duration, should I call it an indefinite phase?

Domain expert: In code storage you may see `durationDays = null`, but in domain language call it a maintenance phase.

Developer: If I add a new semaglutide option to the schedule form, should I also edit inventory and injection forms?

Domain expert: No. That belongs in the drug vocabulary so all forms share the same source of truth.

Developer: If stats show injections every 5.2 days, is that the schedule frequency?

Domain expert: No. That is observed injection frequency from logs. Schedule frequency is the prescribed recurrence on an injection schedule.

Developer: When an injection uses the scheduled drug but a different amount, what should the UI call it?

Domain expert: Call it an off-schedule dosage and ask the user to confirm before saving.
