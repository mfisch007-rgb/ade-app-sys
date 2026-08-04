export default class TimeAwareGreeter {
    static getGreeting(userName = "Captain King Bishop Adam", timeZone = "Africa/Lagos") {
        const formatter = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            hour12: false,
            timeZone: timeZone
        });
        const currentHour = parseInt(formatter.format(new Date()), 10);
        
        let timeOfDay = "Good evening";
        if (currentHour >= 5 && currentHour < 12) timeOfDay = "Good morning";
        else if (currentHour >= 12 && currentHour < 17) timeOfDay = "Good afternoon";
        else if (currentHour >= 17 && currentHour < 21) timeOfDay = "Good evening";
        else timeOfDay = "Goodnight";

        return `${timeOfDay}, ${userName}!`;
    }

  async boot() {
    this.status = 'booting';
    if (typeof this.init === 'function') await this.init();
    this.status = 'booted';
  }

  async ready() {
    this.status = 'ready';
  }

  async shutdown() {
    this.status = 'shutting_down';
  }

  async dispose() {
    this.status = 'disposed';
  }
}
