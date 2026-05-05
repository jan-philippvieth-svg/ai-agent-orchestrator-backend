export class LoggingService {
    chat(event) {
        console.info(JSON.stringify({
            event: 'chat',
            ...event,
        }));
    }
}
