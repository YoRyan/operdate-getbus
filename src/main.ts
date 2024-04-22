type UserProperties =
    | { run: string }
    | { showTime: string, secondShowTime?: string }


const ui = SpreadsheetApp.getUi();
const properties = PropertiesService.getUserProperties();


function onOpen() {
    ui.createMenu("[Operdate]")
        .addItem("Set Run...", "setOperdateRun")
        .addItem("Set Show...", "setOperdateShow")
        .addItem("Populate Today", "doOperdateToday")
        .addItem("Populate Tomorrow", "doOperdateTomorrow")
        .addItem("Populate Date...", "doOperdateDate")
        .addSeparator()
        .addItem("Populate Vacation Relief...", "doOperdateVacationRelief")
        .addSeparator()
        .addItem("Lookup Date...", "doOperdateLookup")
        .addToUi();
}

function setOperdateRun() {
    const response = ui.prompt("Enter run number:");

    if (response.getSelectedButton() !== ui.Button.OK) {
        return;
    }

    const run = response.getResponseText();
    properties.setProperties({ run } as UserProperties, true);
}

function setOperdateShow() {
    const response = ui.prompt(
        "Enter start time, and select 'Yes' to enter a second half start time:",
        ui.ButtonSet.YES_NO
    );

    switch (response.getSelectedButton()) {
        case ui.Button.NO:
            {
                const showTime = response.getResponseText();
                properties.setProperties({ showTime } as UserProperties, true);
            }
            break;
        case ui.Button.YES:
            {
                const response2 = ui.prompt("Enter second start time:");
                const showTime = response.getResponseText();
                const secondShowTime =
                    response2.getSelectedButton() === ui.Button.OK ?
                        response2.getResponseText() : undefined;
                properties.setProperties(
                    { showTime, secondShowTime } as UserProperties, true);
            }
        default:
            return;
    }
}

function doOperdateToday() {
    populateEventsFor(new Date());
}

function doOperdateTomorrow() {
    populateEventsFor(getTomorrow(new Date()));
}

function doOperdateDate() {
    const response = ui.prompt("Enter date to populate:");

    if (response.getSelectedButton() !== ui.Button.OK) {
        return;
    }

    const date = new Date(response.getResponseText());
    // @ts-ignore
    if (isNaN(date)) {
        ui.alert("Bad date format.");
        return;
    }

    populateEventsFor(date);
}

function populateEventsFor(date: Date) {
    const user = properties.getProperties() as UserProperties;

    let events: Event[] = [];

    if ("run" in user) {
        const number = user.run;
        const run = readRuns().get(number);

        if (run) {
            events.push(...createRunEvents(run, date));
        } else {
            ui.alert(`Run ${number} not found.`);
        }
    } else if ("showTime" in user) {
        const showTime = readTime(user.showTime);
        const secondShowTime = user.secondShowTime ?
            readTime(user.secondShowTime) : undefined;

        if (secondShowTime) {
            events.push(
                [
                    "Show", ...createDateSpan(date, showTime, showTime + 60 * 4)
                ],
                [
                    "Show", ...createDateSpan(
                        date, secondShowTime, secondShowTime + 60 * 4)
                ]
            );
        } else {
            const mins = (showTime === 13 * 60 ? 7 : 8) * 60;

            events.push(
                ["Show", ...createDateSpan(date, showTime, showTime + mins)]);
        }
    } else {
        ui.alert("Set an assignment first.")
    }

    addToCalendar(events);
}

function doOperdateVacationRelief() {
    const response = ui.prompt("Enter driver name:");

    if (response.getSelectedButton() !== ui.Button.OK) {
        return;
    }

    const driver = readOperator(response.getResponseText());
    const bids = readBids(readRuns());

    const events = readVacationRelief(bids)
        .map(({ weekOf, assignments }): Event[] => {
            const bid = assignments.get(driver);

            switch (bid) {
                case undefined:
                case false:
                    return [];
                default:
                    const schedule = [
                        bid.sunday, bid.monday, bid.tuesday,
                        bid.wednesday, bid.thursday, bid.friday, bid.saturday
                    ];

                    const events: Event[] = [];

                    let currentDay = weekOf;
                    for (const run of schedule) {
                        if (run !== undefined) {
                            events.push(...createRunEvents(run, currentDay));
                        }
                        currentDay = getTomorrow(currentDay);
                    }

                    return events;
            }
        })
        .flat();

    addToCalendar(events);
}

function createRunEvents(run: Run, date: Date): Event[] {
    const { number, mode } = run;

    switch (mode) {
        case Mode.BigBus:
            {
                const { block, span } = run.piece;
                const events: Event[] = [
                    [
                        `Run ${number} Block ${block} (pays ${getRunPay(run)})`,
                        ...createDateSpan(date, ...span)
                    ]
                ];

                if (run.secondPiece) {
                    const { block, span } = run.secondPiece;
                    events.push([
                        `Run ${number} Block ${block} (pays ${getRunPay(run)})`,
                        ...createDateSpan(date, ...span)
                    ]);
                }

                return events;
            }
        case Mode.OnDemand:    
            {
                const events: Event[] = [
                    [
                        `Run ${number} (pays ${getRunPay(run)})`,
                        ...createDateSpan(date, ...run.span)
                    ]
                ];

                if (run.secondSpan) {
                    events.push([
                        `Run ${number} (pays ${getRunPay(run)})`,
                        ...createDateSpan(date, ...run.secondSpan)
                    ]);
                }

                return events;
            }
    }
}

function doOperdateLookup() {
    const response = ui.prompt("Enter date to lookup:");

    if (response.getSelectedButton() !== ui.Button.OK) {
        return;
    }

    const date = new Date(response.getResponseText());
    const runs = readRuns();
    const bids = readBids(runs);

    // Create the new sheet.
    let row = 1;

    const sheet = SpreadsheetApp
        .getActiveSpreadsheet()
        .insertSheet(
            "Schedule for " +
            `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
        );
    sheet
        .getRange(`A${row}:H${row}`)
        .setValues([
            [
                "Run #", "Total Pay", "Block", "Report Time",
                "Split From", "Split To", "Sign Out", "Driver"
            ]
        ]);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);

    row++;

    // Map bids to their assigned drivers for the requested week.
    const vacationRelief = getCurrentVacationWeek(date, readVacationRelief(bids));
    const vacationReliefByBid = new Map<string, Operator>(
        Array.from(vacationRelief?.assignments ?? [])
            .map(
                ([driver, bid]) => bid !== false ? [bid.number, driver] : undefined
            )
            .filter(entry => entry !== undefined) as [string, Operator][]
    );
    const bidsWithAssigned: [bid: Bid, driver: Operator][] =
        Array.from(bids.values())
            .map(bid => {
                const vacationDriver = vacationReliefByBid?.get(bid.number);
                return [bid, vacationDriver ?? bid.assigned];
            })
            .filter(([, driver]) => driver !== undefined) as [Bid, Operator][]

    // Map runs to their assigned drivers for the requested day.
    const runsWithAssigned = new Map<string, Operator>(
        bidsWithAssigned
            .map(([bid, driver]) => {
                const runNumber = getWorkDayForBid(bid, date)?.number;
                return runNumber ?
                    [runNumber, driver] as [string, Operator] : undefined;
            })
            .filter(entry => entry !== undefined) as [string, Operator][]
    );

    // Identify drivers that have a day off or are on vacation.
    const dayOffOnBid = new Set<Operator>(
        bidsWithAssigned
            .map(([bid, driver]) =>
                getWorkDayForBid(bid, date) ? undefined : driver)
            .filter(driver => driver !== undefined) as Operator[]
    );

    const onVacation = getCurrentVacationWeek(date, readVacations())
        ?.operators ?? new Set<Operator>();

    const dayOffOnExtraBoardBid = getWorkDayForExtraBoard(
        readExtraBoardDaysOff(), date);
    const vacationReliefDrivers = new Set<Operator>(
        vacationRelief?.assignments?.keys() ?? []);
    const vacationReliefDriversWithoutRuns = new Set<Operator>(
        Array.from(vacationRelief?.assignments?.entries() ?? [])
            .filter(([, assignment]) => assignment === false)
            .map(([driver]) => driver)
    );

    const dayOff = unionOfSets(
        unionOfSets(
            differenceOfSets(
                dayOffOnExtraBoardBid,
                vacationReliefDrivers
            ),
            intersectionOfSets(
                dayOffOnExtraBoardBid,
                differenceOfSets(vacationReliefDriversWithoutRuns, onVacation)
            )
        ),
        dayOffOnBid
    );

    // Print all runs with their assigned drivers.
    for (const [number, run] of Array.from(runs)) {
        const driver = runsWithAssigned.get(number) ?? "";

        let block: string;
        let reportTime: Time;
        let signOut: Time;
        let splitFrom: Time | undefined;
        let splitTo: Time | undefined;

        switch (run.mode) {
            case Mode.BigBus:
                const { piece, secondPiece } = run;

                [reportTime] = piece.span;

                if (secondPiece) {
                    block = `${piece.block} / ${secondPiece.block}`;
                    [, signOut] = secondPiece.span;
                    [, splitFrom] = piece.span;
                    [splitTo] = secondPiece.span;
                } else {
                    block = piece.block;
                    [, signOut] = piece.span;
                    splitFrom = splitTo = undefined;
                }
                break;
            case Mode.OnDemand:
                const { span, secondSpan } = run;

                block = "";
                [reportTime] = span;

                if (secondSpan) {
                    [, signOut] = secondSpan;
                    [, splitFrom] = span;
                    [splitTo] = secondSpan;
                } else {
                    [, signOut] = span;
                    splitFrom = splitTo = undefined;
                }
                break;
        }

        sheet
            .getRange(`A${row}:H${row}`)
            .setValues([[
                number,
                getRunPay(run),
                block,
                formatTime(reportTime),
                splitFrom ? formatTime(splitFrom) : "",
                splitTo ? formatTime(splitTo) : "",
                formatTime(signOut),
                driver
            ]]);

        row++;
    }

    // Print all drivers with days off or that are on vacation.
    for (const driver of Array.from(dayOff)) {
        sheet  
            .getRange(`A${row}:H${row}`)
            .setValues([[
                ...new Array(7).fill("OFF"),
                driver
            ]]);

        row++;
    }

    for (const driver of Array.from(onVacation)) {
        sheet  
            .getRange(`A${row}:H${row}`)
            .setValues([[
                ...new Array(7).fill("VAC"),
                driver
            ]]);

        row++;
    }
}

function getCurrentVacationWeek<T extends Vacation | VacationRelief>(
        date: Date, weeks: T[]): T | undefined {
    const dateTime = date.getTime();

    return weeks.find(week => {
        const endOfWeek = new Date(week.weekOf);
        endOfWeek.setTime(endOfWeek.getTime() + (6 * 24 + 1) * 60 * 60 * 1000);

        return dateTime >= week.weekOf.getTime() && dateTime <= endOfWeek.getTime();
    });
}

function getWorkDayForBid(bid: Bid, date: Date): Run | undefined {
    switch (date.getDay()) {
        case 0:
            return bid.sunday;
        case 1:
            return bid.monday;
        case 2:
            return bid.tuesday;
        case 3:
            return bid.wednesday;
        case 4:
            return bid.thursday;
        case 5:
            return bid.friday;
        case 6:
            return bid.saturday;
    }
}

function getWorkDayForExtraBoard(
        daysOff: ExtraBoardDaysOff, date: Date): Set<Operator> {
    switch (date.getDay()) {
        case 0:
            return daysOff.sunday;
        case 1:
            return daysOff.monday;
        case 2:
            return daysOff.tuesday;
        case 3:
            return daysOff.wednesday;
        case 4:
            return daysOff.thursday;
        case 5:
            return daysOff.friday;
        case 6:
            return daysOff.saturday;
        default:
            return new Set<Operator>();
    }
}