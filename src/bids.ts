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


function readRuns(): Map<string, Run> {
    const allData = SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName("Runs")
        .getRange("A1")
        .getDataRegion();
    // Skip the header row.
    const range = allData.offset(1, 0, allData.getHeight() - 1);

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

    const hh = Math.floor(minutes / 60) + "";
    const mm = (minutes % 60 + "").padStart(2, "0");
    return `pays ${hh}:${mm}`;
}