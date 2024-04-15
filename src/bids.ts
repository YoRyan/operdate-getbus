enum Mode {
    BigBus,
    OnDemand
}

type Piece = {
    block: string
    span: Span
};

type BigBusRun = {
    mode: Mode.BigBus
    piece: Piece
    secondPiece?: Piece
}

type OnDemandRun = {
    mode: Mode.OnDemand
    span: Span
    secondSpan?: Span
}

type Run = { number: string } & (BigBusRun | OnDemandRun);

type Operator = string;

type Bid = {
    number: string
    sunday?: Run
    monday?: Run
    tuesday?: Run
    wednesday?: Run
    thursday?: Run
    friday?: Run
    saturday?: Run
    assigned?: Operator
}

type VacationRelief = {
    weekOf: Date
    assignments: Map<Operator, Bid>
}


function readRuns(): Map<string, Run> {
    const range = getDataRegionWithoutHeader(
        SpreadsheetApp
            .getActiveSpreadsheet()
            .getSheetByName("Runs")!
    );
    const runs = new Map<string, Run>();

    for (const [number, block, report, signOut] of range.getDisplayValues()) {
        const span = readSpan(report, signOut);
        const last = runs.get(number);

        let run: Run;

        if (last) {
            switch (last.mode) {
                case Mode.BigBus:
                    run = {
                        number,
                        mode: Mode.BigBus,
                        piece: last.piece,
                        secondPiece: { block, span }
                    };
                    break;
                case Mode.OnDemand:
                    run = {
                        number,
                        mode: Mode.OnDemand,
                        span: last.span,
                        secondSpan: span
                    };
                    break;
            }
        } else if (block) {
            run = {
                number,
                mode: Mode.BigBus,
                piece: { block, span }
            }
        } else {
            run = {
                number,
                mode: Mode.OnDemand,
                span
            };
        }

        runs.set(number, run);
    }

    return runs;
}

function getRunPay(run: Run): string {
    let minutes: number;

    switch (run.mode) {
        case Mode.BigBus:
            minutes = getSpanMins(run.piece.span)
                + (run.secondPiece ? getSpanMins(run.secondPiece.span) : 0);
            break;
        case Mode.OnDemand:
            minutes = getSpanMins(run.span)
                + (run.secondSpan ? getSpanMins(run.secondSpan) : 0);
            break;
    }

    return "pays " + formatTime(minutes);
}

function readBids(runs: Map<string, Run>): Map<string, Bid> {
    const sheet = SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName("Bids")!;

    const bids: [string, Bid][] = getDataRegionWithoutHeader(sheet)
        .getDisplayValues()
        .map(([number, su, m, tu, w, th, f, sa, driver]) => {
            function getRun(runNumber: string) {
                return runNumber !== "" ? runs.get(runNumber) : undefined;
            }

            return [
                number,
                {
                    number,
                    sunday: getRun(su),
                    monday: getRun(m),
                    tuesday: getRun(tu),
                    wednesday: getRun(w),
                    thursday: getRun(th),
                    friday: getRun(f),
                    saturday: getRun(sa),
                    assigned: driver !== "" ? readOperator(driver) : undefined
                }
            ];
        });

    return new Map<string, Bid>(bids);
}

function readVacationRelief(bids: Map<string, Bid>): VacationRelief[] {
    const sheet = SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName("Vacation Relief")!;
    const [names] = sheet
        .getRange("B1:K1")
        .getDisplayValues();
    const drivers = names.map(readOperator);

    return getDataRegionWithoutHeader(sheet)
        .getDisplayValues()
        .map(([weekOf, ...bidNumbers]) => {
            const assignments = new Map<Operator, Bid>(
                bidNumbers
                    .map((number, i): [Operator, Bid] | undefined => {
                        const bid = bids.get(number);
                        return bid ? [drivers[i], bid] : undefined;
                    })
                    .filter(entry => entry !== undefined) as [Operator, Bid][]
            );
            return {
                weekOf: new Date(weekOf),
                assignments
            };
        });
}

/** Standardize driver names for reliable commparison. */
function readOperator(name: string): Operator {
    return name
        .toUpperCase()
        .replaceAll(/(\.\s)+/g, " ");
}

function getDataRegionWithoutHeader(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
    const dataRegion = sheet
        .getRange("A1")
        .getDataRegion();
    return dataRegion.offset(1, 0, dataRegion.getHeight() - 1);
}