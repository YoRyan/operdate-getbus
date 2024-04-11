type Event = [title: string, startTime: Date, endTime: Date];


function addToCalendar(events: Event[]) {
    const [calendar] = CalendarApp.getOwnedCalendarsByName("GET Bus");

    for (const event of events) {
        calendar.createEvent(...event);
    }
}