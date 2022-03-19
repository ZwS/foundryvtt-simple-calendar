import {
    GameSystems,
    GameWorldTimeIntegrations,
    TimeKeeperStatus
} from "../../constants";
import Year from "./year";
import Month from "./month";
import {Logger} from "../logging";
import {GameSettings} from "../foundry-interfacing/game-settings";
import {Weekday} from "./weekday";
import Season from "./season";
import Moon from "./moon";
import GeneralSettings from "../configuration/general-settings";
import ConfigurationItemBase from "../configuration/configuration-item-base";
import PF2E from "../systems/pf2e";
import Renderer from "../renderer";
import {generateUniqueId} from "../utilities/string";
import {DateToTimestamp, DaysBetweenDates, FormatDateTime, ToSeconds} from "../utilities/date-time";
import{canUser} from "../utilities/permissions";
import {CalManager, MainApplication, NManager, SC} from "../index";
import TimeKeeper from "../time/time-keeper";
import NoteStub from "../notes/note-stub";
import Time from "../time/time";

export default class Calendar extends ConfigurationItemBase{
    /**
     * The currently running game system
     * @type {GameSystems}
     */
    gameSystem: GameSystems;
    /**
     * All of the general settings for a calendar
     * @type {GeneralSettings}
     */
    generalSettings: GeneralSettings = new GeneralSettings();
    /**
     * The year class for the calendar
     * @type {Year}
     */
    year: Year;
    /**
     * The days that make up a week
     */
    weekdays: Weekday[] = [];
    /**
     * All the seasons for this calendar
     */
    seasons: Season[] = [];
    /**
     * All the moons for this calendar
     */
    moons: Moon[] =[];
    /**
     * The time object responsible for all time related functionality
     */
    time: Time;
    /**
     * List of all notes in the calendar
     * @type {Array.<Note>}
     */
    public notes: NoteStub[] = [];
    /**
     * List of all categories associated with notes
     * @type{Array.<NoteCategory>}
     */
    public noteCategories: SimpleCalendar.NoteCategory[] = [];
    /**
     * The Time Keeper class used for the in game clock
     */
    timeKeeper: TimeKeeper;

    /**
     * Construct a new Calendar class
     * @param {string} id
     * @param {string} name
     * @param {CalendarData} configuration The configuration object for the calendar
     */
    constructor(id: string, name: string, configuration: SimpleCalendar.CalendarData = {id: ''}) {
        super(name);
        this.id = id || generateUniqueId();
        this.time = new Time();
        this.year = new Year(0);
        this.timeKeeper = new TimeKeeper(this.id, this.time.updateFrequency);
        if(Object.keys(configuration).length > 1){
            this.loadFromSettings(configuration);
        }

        // Set Calendar Data
        this.gameSystem = GameSystems.Other;

        if((<Game>game).system){
            switch ((<Game>game).system.id){
                case GameSystems.DnD5E:
                    this.gameSystem = GameSystems.DnD5E;
                    break;
                case GameSystems.PF1E:
                    this.gameSystem = GameSystems.PF1E;
                    break;
                case GameSystems.PF2E:
                    this.gameSystem = GameSystems.PF2E;
                    break;
                case GameSystems.WarhammerFantasy4E:
                    this.gameSystem = GameSystems.WarhammerFantasy4E;
                    break;
            }
        }
    }

    /**
     * Creates a cloned version of the Calendar class
     */
    clone(includeNotes: boolean = true): Calendar {
        const c = new Calendar(this.id, this.name);
        c.id = this.id;
        c.name = this.name;
        c.gameSystem = this.gameSystem;
        c.generalSettings = this.generalSettings.clone();
        c.year = this.year.clone();
        c.weekdays = this.weekdays.map(w => w.clone());
        c.seasons = this.seasons.map(s => s.clone());
        c.moons = this.moons.map(m => m.clone());
        c.time = this.time.clone();
        if(includeNotes){
            //c.notes = this.notes.map(n => n.clone());
            c.noteCategories = this.noteCategories.map(nc => {return {id: nc.id, name: nc.name, textColor: nc.textColor, color: nc.color}});
        }
        return c;
    }

    /**
     * Creates a template for the calendar class
     */
    toTemplate(): SimpleCalendar.HandlebarTemplateData.Calendar{
        let sYear = this.year.selectedYear, sMonth, sDay;

        const currentMonthDay = this.year.getMonthAndDayIndex();
        const selectedMonthDay = this.year.getMonthAndDayIndex('selected');
        const visibleMonthDay = this.year.getMonthAndDayIndex('visible');

        if(selectedMonthDay.month !== undefined){
            sMonth = selectedMonthDay.month;
            sDay = selectedMonthDay.day || 0;
        } else {
            sYear = this.year.numericRepresentation;
            sMonth = currentMonthDay.month || 0;
            sDay = currentMonthDay.day || 0;
        }

        const noteCounts = NManager.getNoteCountsForDay(this.id, sYear, sMonth, sDay);
        return {
            ...super.toTemplate(),
            calendarDisplayId: `sc_${this.id}_calendar`,
            clockDisplayId: `sc_${this.id}_clock`,
            currentYear: this.year.toTemplate(),
            gameSystem: this.gameSystem,
            id: this.id,
            name: this.name,
            selectedDay: {
                dateDisplay: FormatDateTime({year: sYear, month: sMonth, day: sDay, hour: 0, minute: 0, seconds: 0}, this.generalSettings.dateFormat.date, this),
                noteCount: noteCounts.count,
                noteReminderCount: noteCounts.reminderCount,
                notes: NManager.getNotesForDay(this.id, sYear, sMonth, sDay)
            },
            visibleDate: {year:  this.year.visibleYear, month: visibleMonthDay.month || 0}
        };
    }

    toConfig(): SimpleCalendar.CalendarData {
        return <SimpleCalendar.CalendarData>{
            id: this.id,
            name: this.name,
            currentDate: this.getCurrentDate(),
            general: this.generalSettings.toConfig(),
            leapYear: this.year.leapYearRule.toConfig(),
            months: this.year.months.map(m => m.toConfig()),
            moons: this.moons.map(m => m.toConfig()),
            noteCategories: this.noteCategories,
            seasons: this.seasons.map(s => s.toConfig()),
            time: this.time.toConfig(),
            weekdays: this.weekdays.map(w => w.toConfig()),
            year: this.year.toConfig()
        };
    }

    loadFromSettings(config: SimpleCalendar.CalendarData) {
        if(config.id){
            this.id = config.id;
            this.timeKeeper.calendarId = this.id;
        }
        if(config.name){
            this.name = config.name;
        }

        if(config.year){
            this.year.loadFromSettings(config.year);
        } else if(config.yearSettings){
            this.year.loadFromSettings(config.yearSettings);
        } else {
            Logger.warn(`Invalid year configuration found when loading calendar "${this.name}", setting year to default configuration`);
            this.year = new Year(0);
        }

        if(config.months || config.monthSettings){
            this.year.months = [];
            const configMonths: SimpleCalendar.MonthData[] = config.months || config.monthSettings || [];
            for(let i = 0; i < configMonths.length; i++){
                const newMonth = new Month();
                newMonth.loadFromSettings(configMonths[i]);
                this.year.months.push(newMonth);
            }
        }

        if(config.weekdays || config.weekdaySettings){
            this.weekdays = [];
            const configWeekdays: SimpleCalendar.WeekdayData[] = config.weekdays || config.weekdaySettings || [];
            for(let i = 0; i < configWeekdays.length; i++){
                const newW = new Weekday();
                newW.loadFromSettings(configWeekdays[i]);
                this.weekdays.push(newW);
            }
        }

        if(config.leapYear){
            this.year.leapYearRule.loadFromSettings(config.leapYear);
        } else if(config.leapYearSettings){
            this.year.leapYearRule.loadFromSettings(config.leapYearSettings);
        }

        if(config.time){
            this.time.loadFromSettings(config.time);
            this.timeKeeper.updateFrequency = this.time.updateFrequency;
        } else if(config.timeSettings){
            this.time.loadFromSettings(config.timeSettings);
            this.timeKeeper.updateFrequency = this.time.updateFrequency;
        }

        if(config.seasons || config.seasonSettings){
            this.seasons = [];
            const configSeasons: SimpleCalendar.SeasonData[] = config.seasons || config.seasonSettings || [];
            for(let i = 0; i < configSeasons.length; i++){
                const newW = new Season();
                newW.loadFromSettings(configSeasons[i]);
                this.seasons.push(newW);
            }
        }

        if(config.moons || config.moonSettings){
            this.moons = [];
            const configMoons: SimpleCalendar.MoonData[] = config.moons || config.moonSettings || [];
            for(let i = 0; i < configMoons.length; i++){
                const newW = new Moon();
                newW.loadFromSettings(configMoons[i]);
                this.moons.push(newW);
            }
        }

        if(config.general){
            this.generalSettings.loadFromSettings(config.general);
        } else if(config.generalSettings){
            this.generalSettings.loadFromSettings(config.generalSettings);
        }

        if(config.noteCategories){
            this.noteCategories = config.noteCategories;
        }

        if(config.currentDate){
            this.year.numericRepresentation = config.currentDate.year;
            this.year.selectedYear = config.currentDate.year;
            this.year.visibleYear = config.currentDate.year;

            this.year.resetMonths('current');
            this.year.resetMonths('visible');

            if(config.currentDate.month > -1 && config.currentDate.month < this.year.months.length){
                this.year.months[config.currentDate.month].current = true;
                this.year.months[config.currentDate.month].visible = true;
                if(config.currentDate.day > -1 && config.currentDate.day < this.year.months[config.currentDate.month].days.length){
                    this.year.months[config.currentDate.month].days[config.currentDate.day].current = true;
                } else {
                    Logger.warn('Saved current day could not be found in this month, perhaps number of days has changed. Setting current day to first day of month');
                    this.year.months[config.currentDate.month].days[0].current = true;
                }
            } else {
                Logger.warn('Saved current month could not be found, perhaps months have changed. Setting current month to the first month');
                this.year.months[0].current = true;
                this.year.months[0].visible = true;
                this.year.months[0].days[0].current = true;
            }
            this.time.seconds = config.currentDate.seconds;
            if(this.time.seconds === undefined){
                this.time.seconds = 0;
            }
        } else if(this.year.months.length) {
            Logger.warn('No current date setting found, setting default current date.');
            this.year.months[0].current = true;
            this.year.months[0].visible = true;
            this.year.months[0].days[0].current = true;
        } else {
            Logger.error('Error setting the current date.');
        }
    }

    /**
     * Gets the current date configuration object
     * @private
     */
    getCurrentDate(): SimpleCalendar.CurrentDateData{
        const monthDayIndex = this.year.getMonthAndDayIndex();
        return {
            year: this.year.numericRepresentation,
            month: monthDayIndex.month || 0,
            day: monthDayIndex.day || 0,
            seconds: this.time.seconds
        };
    }

    /**
     * Gets the date and time for the selected date, or if not date is selected the current date
     */
    getDateTime(): SimpleCalendar.DateTime {
        const dt: SimpleCalendar.DateTime = {
            year: 0,
            month: 0,
            day: 0,
            hour: 0,
            minute: 0,
            seconds: 0
        };
        const selectedMonthDayIndex = this.year.getMonthAndDayIndex('selected');
        const currentMonthDayIndex = this.year.getMonthAndDayIndex();
        if(selectedMonthDayIndex.month !== undefined){
            dt.year = this.year.selectedYear;
            dt.month = selectedMonthDayIndex.month;
            dt.day = selectedMonthDayIndex.day || 0;
        } else {
            dt.year = this.year.numericRepresentation;
            dt.month = currentMonthDayIndex.month || 0;
            dt.day = currentMonthDayIndex.day || 0;

            const time = this.time.getCurrentTime();
            dt.hour = time.hour;
            dt.minute = time.minute;
            dt.seconds = time.seconds;
        }
        return dt;
    }

    /**
     * Gets the current season based on the current date
     */
    getCurrentSeason() {
        let monthIndex = this.year.getMonthIndex('visible');
        if(monthIndex === -1){
            monthIndex = 0;
        }

        let dayIndex = this.year.months[monthIndex].getDayIndex('selected');
        if(dayIndex === -1){
            dayIndex = this.year.months[monthIndex].getDayIndex();
            if(dayIndex === -1){
                dayIndex = 0;
            }
        }
        const season = this.getSeason(monthIndex, dayIndex);
        return {
            name: season.name,
            color: season.color
        };
    }

    /**
     * Gets the season for the passed in month and day
     * @param {number} monthIndex The index of the month
     * @param {number} dayIndex The day number
     */
    getSeason(monthIndex: number, dayIndex: number) {
        let season = new Season('', 0, 0);
        if(dayIndex >= 0 && monthIndex >= 0){
            let currentSeason: Season | null = null;
            const sortedSeasons = this.seasons.sort((a, b) => {
                return a.startingMonth - b.startingMonth || a.startingDay - b.startingDay;
            });

            for(let i = 0; i < sortedSeasons.length; i++){
                if(sortedSeasons[i].startingMonth === monthIndex && sortedSeasons[i].startingDay <= dayIndex){
                    currentSeason = sortedSeasons[i];
                } else if (sortedSeasons[i].startingMonth < monthIndex){
                    currentSeason = sortedSeasons[i];
                }
            }
            if(currentSeason === null){
                currentSeason = sortedSeasons[sortedSeasons.length - 1];
            }

            if(currentSeason){
                season = currentSeason.clone();
            }
        }
        return season;
    }

    /**
     * Calculates the sunrise or sunset time for the passed in date, based on the the season setup
     * @param {number} year The year of the date
     * @param {Month} monthIndex The month object of the date
     * @param {Day} dayIndex The day object of the date
     * @param {boolean} [sunrise=true] If to calculate the sunrise or sunset
     * @param {boolean} [calculateTimestamp=true] If to add the date timestamp to the sunrise/sunset time
     */
    getSunriseSunsetTime(year: number, monthIndex: number, dayIndex: number, sunrise: boolean = true, calculateTimestamp: boolean = true){
        const activeCalendar = CalManager.getActiveCalendar();
        const sortedSeasons = this.seasons.sort((a, b) => {
            return a.startingMonth - b.startingMonth || a.startingDay - b.startingDay;
        });
        let seasonIndex = sortedSeasons.length - 1;
        for(let i = 0; i < sortedSeasons.length; i++){
            if(sortedSeasons[i].startingMonth === monthIndex && sortedSeasons[i].startingDay <= dayIndex){
                seasonIndex = i;
            } else if (sortedSeasons[i].startingMonth < monthIndex){
                seasonIndex = i;
            }
        }
        const nextSeasonIndex = (seasonIndex + 1) % this.seasons.length;
        if(seasonIndex < sortedSeasons.length && nextSeasonIndex < sortedSeasons.length){
            let season = sortedSeasons[seasonIndex];
            const nextSeason = sortedSeasons[nextSeasonIndex];
            let seasonYear = year;
            let nextSeasonYear = seasonYear;

            //If the current season is the last season of the year we need to check to see if the year for this season is the year before the current date
            if(seasonIndex === sortedSeasons.length - 1){
                if(monthIndex < sortedSeasons[seasonIndex].startingMonth || (sortedSeasons[seasonIndex].startingMonth === monthIndex && dayIndex < sortedSeasons[seasonIndex].startingDay)){
                    seasonYear = year - 1;
                }
                nextSeasonYear = seasonYear + 1
            }
            const daysBetweenSeasonStartAndDay = DaysBetweenDates(activeCalendar,
                { year: seasonYear, month: season.startingMonth, day: season.startingDay, hour: 0, minute: 0, seconds: 0 },
                { year: year, month: monthIndex, day: dayIndex, hour: 0, minute: 0, seconds: 0 }
            );
            const daysBetweenSeasons = DaysBetweenDates(activeCalendar,
                { year: seasonYear, month: season.startingMonth, day: season.startingDay, hour: 0, minute: 0, seconds: 0 },
                { year: nextSeasonYear, month: nextSeason.startingMonth, day: nextSeason.startingDay, hour: 0, minute: 0, seconds: 0 }
            );
            const diff = sunrise? nextSeason.sunriseTime - season.sunriseTime : nextSeason.sunsetTime - season.sunsetTime;
            const averageChangePerDay = diff / daysBetweenSeasons;
            const sunriseChangeForDay = daysBetweenSeasonStartAndDay * averageChangePerDay;
            const finalSunriseTime = Math.round((sunrise? season.sunriseTime : season.sunsetTime) + sunriseChangeForDay);
            if(calculateTimestamp){
                return DateToTimestamp({ year: year, month: monthIndex, day: dayIndex, hour: 0, minute: 0, seconds: 0 }, activeCalendar) + finalSunriseTime;
            } else {
                return finalSunriseTime;
            }
        }
        return 0;
    }

    //-------------------------------
    // Date/Time Management
    //-------------------------------

    /**
     * Will take the days of the passed in month and break it into an array of weeks
     * @param monthIndex The month to get the days from
     * @param year The year the month is in (for leap year calculation)
     * @param weekLength How many days there are in a week
     */
    daysIntoWeeks(monthIndex: number, year: number, weekLength: number): (boolean | SimpleCalendar.HandlebarTemplateData.Day)[][]{
        const weeks = [];
        const dayOfWeekOffset = this.monthStartingDayOfWeek(monthIndex, year);
        const isLeapYear = this.year.leapYearRule.isLeapYear(year);
        const days = this.year.months[monthIndex].getDaysForTemplate(isLeapYear);

        if(days.length && weekLength > 0){
            const startingWeek = [];
            let dayOffset = 0;
            for(let i = 0; i < weekLength; i++){
                if(i<dayOfWeekOffset){
                    startingWeek.push(false);
                } else {
                    const dayIndex = i - dayOfWeekOffset;
                    if(dayIndex < days.length){
                        startingWeek.push(days[dayIndex]);
                        dayOffset++;
                    } else {
                        startingWeek.push(false);
                    }
                }
            }
            weeks.push(startingWeek);
            const numWeeks = Math.ceil((days.length - dayOffset) / weekLength);
            for(let i = 0; i < numWeeks; i++){
                const w = [];
                for(let d = 0; d < weekLength; d++){
                    const dayIndex = dayOffset + (i * weekLength) + d;
                    if(dayIndex < days.length){
                        w.push(days[dayIndex]);
                    } else {
                        w.push(false);
                    }
                }
                weeks.push(w);
            }
        }
        return weeks;
    }

    /**
     * Calculates the day of the week a passed in day falls on based on its month and year
     * @param {number} year The year of the date to find its day of the week
     * @param {number} monthIndex The month that the target day is in
     * @param {number} dayIndex  The day of the month that we want to check
     * @return {number}
     */
    dayOfTheWeek(year: number, monthIndex: number, dayIndex: number): number{
        if(this.weekdays.length){
            const activeCalendar = CalManager.getActiveCalendar();
            if(activeCalendar.gameSystem === GameSystems.PF2E && activeCalendar.generalSettings.pf2eSync){
                const pf2eAdjust = PF2E.weekdayAdjust();
                if(pf2eAdjust !== undefined){
                    this.year.firstWeekday = pf2eAdjust;
                }
            }

            const month = this.year.months[monthIndex];
            let daysSoFar;
            if(month && month.startingWeekday !== null){
                daysSoFar = dayIndex + month.startingWeekday - 1;
            } else {
                daysSoFar = this.year.dateToDays(year, monthIndex, dayIndex) + this.year.firstWeekday;
            }
            return (daysSoFar % this.weekdays.length + this.weekdays.length) % this.weekdays.length;
        } else {
            return 0;
        }
    }

    /**
     * Calculates the day of the week the first day of the currently visible month lands on
     * @param {Month} monthIndex The month to get the starting day of the week for
     * @param {number} year The year the check
     * @return {number}
     */
    monthStartingDayOfWeek(monthIndex: number, year: number): number {
        if(monthIndex > -1 && monthIndex < this.year.months.length && !(this.year.months[monthIndex].intercalary && !this.year.months[monthIndex].intercalaryInclude)){
            return this.dayOfTheWeek(year, monthIndex, 0);
        }
        return 0;
    }

    /**
     * Convert a number of seconds to year, month, day, hour, minute, seconds
     * @param {number} seconds The seconds to convert
     */
    secondsToDate(seconds: number): SimpleCalendar.DateTime{
        const beforeYearZero = seconds < 0;
        seconds = Math.abs(seconds);
        let sec, min, hour, day = 0, dayCount, month = 0, year = 0;

        dayCount = Math.floor(seconds / this.time.secondsPerDay);
        seconds -= dayCount * this.time.secondsPerDay;

        let timeOfDaySeconds = beforeYearZero? this.time.secondsPerDay - seconds : seconds;
        hour = Math.floor(timeOfDaySeconds / (this.time.secondsInMinute * this.time.minutesInHour) ) % this.time.hoursInDay;
        timeOfDaySeconds -= hour * (this.time.secondsInMinute * this.time.minutesInHour);
        min = Math.floor(timeOfDaySeconds / this.time.secondsInMinute) % this.time.secondsInMinute;
        timeOfDaySeconds -= min * this.time.secondsInMinute;
        sec = timeOfDaySeconds % 60;

        if(beforeYearZero){
            year = this.year.yearZero - 1;
            let isLeapYear = this.year.leapYearRule.isLeapYear(year);
            month = this.year.months.length - 1;
            day = isLeapYear? this.year.months[month].numberOfLeapYearDays - 1 : this.year.months[month].numberOfDays - 1;

            if(sec === 0 && min === 0 && hour === 0){
                dayCount--;
            }
            while(dayCount > 0){
                const yearTotalDays = this.year.totalNumberOfDays(isLeapYear, true);
                let monthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                if(dayCount >= yearTotalDays){
                    year = year - 1;
                    isLeapYear = this.year.leapYearRule.isLeapYear(year);
                    monthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                    dayCount = dayCount - yearTotalDays;
                } else if(dayCount >= monthDays){
                    month = month - 1;
                    //Check the new month to see if it has days for this year, if not then skip to the previous months until a month with days this year is found.
                    let newMonthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                    let safetyCounter = 0
                    while(newMonthDays === 0 && safetyCounter <= this.year.months.length){
                        month--;
                        newMonthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                        safetyCounter++;
                    }
                    day = isLeapYear? this.year.months[month].numberOfLeapYearDays - 1 : this.year.months[month].numberOfDays - 1;
                    dayCount = dayCount - monthDays;
                } else {
                    day = day - 1;
                    dayCount = dayCount - 1;
                }
            }
        } else {
            year = this.year.yearZero;
            let isLeapYear = this.year.leapYearRule.isLeapYear(year);
            month = 0;
            day = 0;
            while(dayCount > 0){
                const yearTotalDays = this.year.totalNumberOfDays(isLeapYear, true);
                const monthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                if(dayCount >= yearTotalDays){
                    year = year + 1;
                    isLeapYear = this.year.leapYearRule.isLeapYear(year);
                    dayCount = dayCount - yearTotalDays;
                } else if(dayCount >= monthDays){
                    month = month + 1;
                    //Check the new month to see if it has days for this year, if not then skip to the next months until a month with days this year is found.
                    let newMonthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                    let safetyCounter = 0
                    while(newMonthDays === 0 && safetyCounter <= this.year.months.length){
                        month++;
                        newMonthDays = isLeapYear? this.year.months[month].numberOfLeapYearDays : this.year.months[month].numberOfDays;
                        safetyCounter++;
                    }
                    dayCount = dayCount - monthDays;
                } else {
                    day = day + 1;
                    dayCount = dayCount - 1;
                }
            }
            if(year < 0){
                day++;
            }
        }
        return {
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: min,
            seconds: sec
        }
    }

    /**
     * Convert the passed in seconds into an interval of larger time
     * @param seconds
     */
    secondsToInterval(seconds: number): SimpleCalendar.DateTimeParts {
        let sec = seconds, min = 0, hour = 0, day = 0, month = 0, year = 0;
        if(sec >= this.time.secondsInMinute){
            min = Math.floor(sec / this.time.secondsInMinute);
            sec = sec - (min * this.time.secondsInMinute);
        }
        if(min >= this.time.minutesInHour){
            hour = Math.floor(min / this.time.minutesInHour);
            min = min - (hour * this.time.minutesInHour);
        }
        let dayCount = 0;
        if(hour >= this.time.hoursInDay){
            dayCount = Math.floor(hour / this.time.hoursInDay);
            hour = hour - (dayCount * this.time.hoursInDay);
        }

        const daysInYear = this.year.totalNumberOfDays(false, false);
        const averageDaysInMonth = daysInYear / this.year.months.map(m => !m.intercalary).length;

        month = Math.floor(dayCount / averageDaysInMonth);
        day = dayCount - Math.round(month * averageDaysInMonth);

        year = Math.floor(month / this.year.months.length);
        month = month - Math.round(year * this.year.months.length);

        return {
            seconds: sec,
            minute: min,
            hour: hour,
            day: day,
            month: month,
            year: year
        };
    }

    /**
     * Converts current date into seconds
     */
    public toSeconds(){
        const monthDay = this.year.getMonthAndDayIndex();
        return ToSeconds(this, this.year.numericRepresentation, monthDay.month || 0, monthDay.day || 0, true);
    }

    public changeDateTime(interval: SimpleCalendar.DateTimeParts, yearChangeUpdateMonth: boolean = true, syncChange: boolean = false){
        if(canUser((<Game>game).user, SC.globalConfiguration.permissions.changeDateTime)){
            let change = false;
            if(interval.year){
                this.year.changeYear(interval.year, yearChangeUpdateMonth, 'current');
                change = true;
            }
            if(interval.month){
                this.year.changeMonth(interval.month, 'current');
                change = true;
            }
            if(interval.day){
                this.year.changeDay(interval.day);
                change = true;
            }
            if(interval.hour || interval.minute || interval.seconds){
                const dayChange = this.time.changeTime(interval.hour, interval.minute, interval.seconds);
                if(dayChange !== 0){
                    this.year.changeDay(dayChange);
                }
                change = true;
            }

            if(change && !syncChange){
                if(SC.globalConfiguration.syncCalendars){
                    const calendars = CalManager.getAllCalendars();
                    for(let i = 0; i < calendars.length; i++){
                        if(calendars[i].id !== this.id){
                            calendars[i].changeDateTime(interval, yearChangeUpdateMonth, true);
                        }
                    }
                }
                CalManager.saveCalendars().catch(Logger.error);
                this.syncTime().catch(Logger.error);
                MainApplication.updateApp();
            }
            return true;
        } else {
            GameSettings.UiNotification(GameSettings.Localize('FSC.Warn.Macros.GMUpdate'), 'warn');
        }
        return false;
    }

    /**
     * Sets the current game world time to match what our current time is
     */
    async syncTime(force: boolean = false){
        // Only if the time tracking rules are set to self or mixed
        if(canUser((<Game>game).user, SC.globalConfiguration.permissions.changeDateTime) && (this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Self || this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Mixed)){
            const totalSeconds = this.toSeconds();
            // If the calculated seconds are different from what is set in the game world time, update the game world time to match sc's time
            if(totalSeconds !== (<Game>game).time.worldTime || force){
                //Let the local functions know that we already updated this time
                this.year.timeChangeTriggered = true;
                //Set the world time, this will trigger the setFromTime function on all connected players when the updateWorldTime hook is triggered
                await this.time.setWorldTime(totalSeconds);
            }
        }
    }

    /**
     * Sets the simple calendars year, month, day and time from a passed in number of seconds
     * @param {number} newTime The new time represented by seconds
     * @param {number} changeAmount The amount that the time has changed by
     */
    setFromTime(newTime: number, changeAmount: number){
        // If this is a Pathfinder 2E game, add the world creation seconds
        if(this.gameSystem === GameSystems.PF2E && this.generalSettings.pf2eSync){
            newTime += PF2E.getWorldCreateSeconds(this);
        }
        if(changeAmount !== 0){
            // If the tracking rules are for self or mixed and the clock is running then we make the change.
            if((this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Self || this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Mixed) && this.timeKeeper.getStatus() === TimeKeeperStatus.Started){
                const parsedDate = this.secondsToDate(newTime);
                this.updateTime(parsedDate);
                Renderer.Clock.UpdateListener(`sc_${this.id}_clock`, this.timeKeeper.getStatus());
                //Something else has changed the world time and we need to update everything to reflect that.
                if((this.time.updateFrequency * this.time.gameTimeRatio) !== changeAmount){
                    MainApplication.updateApp();
                }
            }
            // If the tracking rules are for self only and we requested the change OR the change came from a combat turn change
            else if((this.generalSettings.gameWorldTimeIntegration=== GameWorldTimeIntegrations.Self || this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Mixed) && (this.year.timeChangeTriggered || this.year.combatChangeTriggered)){
                //If we didn't request the change (from a combat change) we need to update the internal time to match the new world time
                if(!this.year.timeChangeTriggered){
                    const parsedDate = this.secondsToDate(newTime);
                    this.updateTime(parsedDate);
                    // If the current player is the GM then we need to save this new value to the database
                    // Since the current date is updated this will trigger an update on all players as well
                    if(GameSettings.IsGm() && SC.primary){
                        CalManager.saveCalendars().catch(Logger.error);
                    }
                }
            }
                // If we didn't (locally) request this change then parse the new time into years, months, days and seconds and set those values
            // This covers other modules/built in features updating the world time and Simple Calendar updating to reflect those changes
            else if((this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.ThirdParty || this.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Mixed) && !this.year.timeChangeTriggered){
                const parsedDate = this.secondsToDate(newTime);
                this.updateTime(parsedDate);
                //We need to save the change so that when the game is reloaded simple calendar will display the correct time
                if(GameSettings.IsGm() && SC.primary){
                    CalManager.saveCalendars().catch(Logger.error);
                }
            }
        }
        this.year.timeChangeTriggered = false;
        this.year.combatChangeTriggered = false;
    }

    /**
     * If we have determined that the system does not change the world time when a combat round is changed we run this function to update the time by the set amount.
     * @param {Combat} combat The current active combat
     */
    processOwnCombatRoundTime(combat: Combat){
        let roundSeconds = SC.globalConfiguration.secondsInCombatRound;
        let roundsPassed = 1;

        if(combat.hasOwnProperty('previous') && combat['previous'].round){
            roundsPassed = combat.round - combat['previous'].round;
        }
        if(roundSeconds !== 0 && roundsPassed !== 0){
            const parsedDate = this.secondsToDate(this.toSeconds() + (roundSeconds * roundsPassed));
            this.updateTime(parsedDate);
            // If the current player is the GM then we need to save this new value to the database
            // Since the current date is updated this will trigger an update on all players as well
            if(GameSettings.IsGm() && SC.primary){
                CalManager.saveCalendars().catch(Logger.error);
            }
        }
    }

    /**
     * Updates the year's data with passed in date information
     * @param {DateTimeParts} parsedDate Interface that contains all of the individual parts of a date and time
     */
    updateTime(parsedDate: SimpleCalendar.DateTime){
        let isLeapYear = this.year.leapYearRule.isLeapYear(parsedDate.year);
        this.year.numericRepresentation = parsedDate.year;
        this.year.updateMonth(parsedDate.month, 'current', true);
        this.year.months[parsedDate.month].updateDay(parsedDate.day, isLeapYear);
        this.time.setTime(parsedDate.hour, parsedDate.minute, parsedDate.seconds);
    }
}
