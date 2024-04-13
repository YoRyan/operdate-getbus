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
                    response2.getSelectedButton() === ui.Button.OK
                        ? response2.getResponseText() : undefined;
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
        const secondShowTime = user.secondShowTime
            ? readTime(user.secondShowTime) : undefined;

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

            if (bid === undefined) {
                return [];
            } else {
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
                        `Run ${number} Block ${block} (${getRunPay(run)})`,
                        ...createDateSpan(date, ...span)
                    ]
                ];

                if (run.secondPiece) {
                    const { block, span } = run.secondPiece;
                    events.push([
                        `Run ${number} Block ${block} (${getRunPay(run)})`,
                        ...createDateSpan(date, ...span)
                    ]);
                }

                return events;
            }
        case Mode.OnDemand:    
            {
                const events: Event[] = [
                    [
                        `Run ${number} (${getRunPay(run)})`,
                        ...createDateSpan(date, ...run.span)
                    ]
                ];

                if (run.secondSpan) {
                    events.push([
                        `Run ${number} (${getRunPay(run)})`,
                        ...createDateSpan(date, ...run.secondSpan)
                    ]);
                }

                return events;
            }
    }
}