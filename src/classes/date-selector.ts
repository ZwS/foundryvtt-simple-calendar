import {SCDateSelector, SCRenderer} from "../interfaces";
import SimpleCalendar from "./simple-calendar";
import {GameSettings} from "./game-settings";
import Utilities from "./utilities";
import Renderer from "./renderer";
import {CalendarClickEvents} from "../constants";

export default class DateSelector {

    /**
     * List of date selector objects that are active on the page.
     * @type {SCDateSelector.SelectorList}
     */
    static Selectors:SCDateSelector.SelectorList = {};

    /**
     * Creates a new Date Selector or returns an existing Date Selector if it all ready exists in the list.
     * @param {string} id The unique ID of the selector to add
     * @param {SCDateSelector.Options} options The options associated with setting up the new Date Selector
     * @return {DateSelector}
     */
    static GetSelector(id: string, options: SCDateSelector.Options){
        if(DateSelector.Selectors.hasOwnProperty(id)){
            return this.Selectors[id];
        } else {
            const ds = new DateSelector(id, options);
            this.Selectors[id] = ds;
            return ds;
        }
    }

    /**
     * Removes a Date Selector from the list of selectors
     * @param {string} id The ID of the selector to remove
     */
    static RemoveSelector(id: string){
        if(DateSelector.Selectors.hasOwnProperty(id)){
            delete this.Selectors[id];
        }
    }

    /**
     * The unique ID of the date selector object
     * @type {string}
     */
    id: string;
    /**
     * If to show the calendar portion of the picker
     * @type{boolean}
     */
    showDate: boolean;
    /**
     * If to show the year for date selection
     * @type {boolean}
     */
    showYear: boolean = true;
    /**
     * If to show the time portion of the picker
     * @type{boolean}
     */
    showTime: boolean;
    /**
     * If the add time controls should be shown or not
     */
    addTime: boolean = false;
    /**
     * Any place holder text for the Date Select input box
     * @type {string}
     */
    placeHolderText: string = '';
    /**
     * The string between the start and end time inputs
     * @type {string}
     */
    timeDelimiter: string = '-';
    /**
     * If the date selector allows users to select a range of dates or just a single date
     * @type {boolean}
     */
    dateRange: boolean = false;
    /**
     * If the time selectors allow users to select a range of time or just a single time stamp
     * @type {boolean}
     */
    timeRange: boolean = true;
    /**
     * Used internally to determine if the second day of a range has been selected.
     * @type {boolean}
     */
    secondDaySelect: boolean = false;
    /**
     * The currently selected date
     * @type {SCDateSelector.SelectedDate}
     */
    selectedDate: SCDateSelector.SelectedDate;
    /**
     * A function to call when a date is selected
     * @type{Function | null}
     */
    onDateSelect: Function | null = null;


    calendarId: string;

    timeSelectorId: string;

    /**
     * Constructor for a new Date Selector
     * @param {string} id The unique ID of the selector to add
     * @param {SCDateSelector.Options} options The options associated with setting up the new Date Selector
     */
    constructor(id: string, options: SCDateSelector.Options) {
        this.id = id;
        this.calendarId = `${this.id}_calendar`;
        this.timeSelectorId = `${this.id}_time_selector`;
        this.showDate = options.showDate;
        this.showTime = options.showTime;
        this.selectedDate = {
            visibleDate:{
                year: 0,
                month: 0,
                day: 0,
                allDay: true,
                hour: 0,
                minute: 0
            },
            startDate: {
                year: 0,
                month: 0,
                day: 0,
                allDay: true,
                hour: 0,
                minute: 0
            },
            endDate: {
                year: 0,
                month: 0,
                day: 0,
                allDay: true,
                hour: 0,
                minute: 0
            }
        };
        if(options.showYear !== undefined){
            this.showYear = options.showYear;
        }
        if(options.placeHolderText){
            this.placeHolderText = options.placeHolderText;
        }

        if(options.onDateSelect){
            this.onDateSelect = options.onDateSelect;
        }

        if(options.dateRangeSelect !== undefined){
            this.dateRange = options.dateRangeSelect;
        }
        if(options.timeRangeSelect !== undefined){
            this.timeRange = options.timeRangeSelect;
        }
        if(options.timeDelimiter !== undefined){
            this.timeDelimiter = options.timeDelimiter;
        }

        if(options.startDate !== undefined){
            this.selectedDate.startDate = {
                year: options.startDate.year,
                month: options.startDate.month,
                day: options.startDate.day,
                allDay: !this.showTime,
                hour: options.startDate.hour,
                minute: options.startDate.minute
            };
        } else {
            this.selectedDate.startDate = {
                year: 0,
                month: 1,
                day: 1,
                allDay: true,
                hour: 0,
                minute: 0
            };
        }
        this.selectedDate.visibleDate = {
            year: this.selectedDate.startDate.year,
            month: this.selectedDate.startDate.month,
            day: this.selectedDate.startDate.day,
            allDay: !this.selectedDate.startDate.allDay,
            hour: this.selectedDate.startDate.hour,
            minute: this.selectedDate.startDate.minute
        };
        this.selectedDate.endDate = this.selectedDate.startDate;
        if(options.endDate !== undefined){
            this.selectedDate.endDate = {
                year: options.endDate.year,
                month: options.endDate.month,
                day: options.endDate.day,
                allDay: !this.showTime,
                hour: options.endDate.hour,
                minute: options.endDate.minute
            };
        }
        if(options.allDay !== undefined){
            this.selectedDate.startDate.allDay = options.allDay;
            this.selectedDate.endDate.allDay = options.allDay;
            this.selectedDate.visibleDate.allDay = options.allDay;
        }
        if(!this.selectedDate.startDate.allDay){
            this.addTime = true;
        }
    }

    /**
     * Builds the HTML string for the Date Select input
     * @param {boolean} [hideCalendar=false] If we should just be rendering the calendar HTML or the full inputs HTML
     */
    build(hideCalendar = true){
        let returnHtml;
        let wrapper = `<div id="${this.id}" class="sc-date-selector">`;
        let calendar = '';
        let timeSelectors = '';

        if(this.showDate){
            calendar = Renderer.CalendarFull.Render(SimpleCalendar.instance.activeCalendar, {
                id: this.calendarId,
                allowChangeMonth: true,
                allowSelectDateRange: this.dateRange,
                cssClasses: `sc-date-selector-calendar`,
                colorToMatchSeason: false,
                showCurrentDate: false,
                showMoonPhases: false,
                showNoteCount: false,
                showSeasonName: false,
                showYear: this.showYear,
                date: {
                    month: SimpleCalendar.instance.activeCalendar.year.months.findIndex(m => m.numericRepresentation === this.selectedDate.visibleDate.month),
                    year: this.selectedDate.visibleDate.year
                },
                selectedDates: {
                    start: {
                        year: this.selectedDate.startDate.year,
                        month: SimpleCalendar.instance.activeCalendar.year.months.findIndex(m => m.numericRepresentation === this.selectedDate.startDate.month),
                        day: this.selectedDate.startDate.day
                    },
                    end: {
                        year: this.selectedDate.endDate.year,
                        month: SimpleCalendar.instance.activeCalendar.year.months.findIndex(m => m.numericRepresentation === this.selectedDate.endDate.month),
                        day: this.selectedDate.endDate.day
                    }
                }
            });
        }
        if(this.showTime){
            if(this.addTime){
                timeSelectors = Renderer.TimeSelector.Render(SimpleCalendar.instance.activeCalendar, {
                    id: this.timeSelectorId,
                    allowTimeRange: this.timeRange,
                    disableSelfUpdate: true,
                    selectedTime: {
                        start: {
                            hour: this.selectedDate.startDate.hour,
                            minute: this.selectedDate.startDate.minute
                        },
                        end: {
                            hour: this.selectedDate.endDate.hour,
                            minute: this.selectedDate.endDate.minute
                        }
                    },
                    timeDelimiter: this.timeDelimiter
                });

                if(this.showDate){
                    timeSelectors += `<div class="remove-time"><button class="control delete"><i class="fa fa-times"></i> ${GameSettings.Localize('FSC.RemoveTime')}</button></div>`;
                }
            } else {
                timeSelectors += `<div class="add-time"><button class="control"><i class="fa fa-clock"></i> ${GameSettings.Localize('FSC.Notes.DateTime.AllDay')}</button></div>`;
            }
        }
        const displayDate = Utilities.GetDisplayDate(this.selectedDate.startDate, this.selectedDate.endDate, (this.showTime && !this.showDate), this.showYear, this.timeDelimiter);
        returnHtml = `${wrapper}<input class="display-input" value="${displayDate}" placeholder="${this.placeHolderText}" tabindex="0" type="text" readonly="readonly"><div class="sc-date-selector-calendar-wrapper${this.showTime && !this.showDate? ' just-time' : ''}" style="display:${hideCalendar? 'none' : 'block'};">${calendar}${timeSelectors}</div></div>`;
        return returnHtml;
    }

    /**
     * Updates the current calendar display for showing a new month
     */
    update(){
        const newData = this.build(false);
        const ds = document.querySelector(`#${this.id}`);
        if(ds){
            ds.innerHTML = newData;
            this.activateListeners(ds.parentElement, false);
            (<HTMLElement>ds).style.display = "block";
        }
    }

    /**
     * Adds all of the click events needed to the calendars HTML for proper interaction
     * @param {HTMLElement | null} html The HTML element for the calendar
     * @param {boolean} justCalendar If we should just update the listeners for the calendar
     */
    activateListeners(html: HTMLElement | null = null, justCalendar: boolean = false){
        if(!html){
            html = document.querySelector(`#${this.id}`);
        }
        if(html){
            if(!justCalendar){
                document.addEventListener('click', this.hideCalendar.bind(this,html));
                const di = <HTMLElement>html.querySelector('.display-input');
                if(di){
                    di.addEventListener('click', this.toggleCalendar.bind(this, html));
                }
                if(this.showDate){
                    Renderer.CalendarFull.ActivateListeners(this.calendarId, this.changeMonthClick.bind(this), this.dayClick.bind(this));
                }
                if(this.showTime){
                    Renderer.TimeSelector.ActivateListeners(this.timeSelectorId, this.timeChange.bind(this));
                }
            }

            if(this.showDate){
                const cal = <HTMLElement>html.querySelector('.sc-date-selector-calendar');
                if(cal){
                    cal.addEventListener('click', this.calendarClick.bind(this));
                }
            }

            if(this.showTime){
                const atb = html.querySelector('.add-time button');
                if(atb){
                    atb.addEventListener('click', this.addTimeClick.bind(this));
                }
                const cb = html.querySelector('.remove-time button');
                if(cb){
                    cb.addEventListener('click', this.removeTimeClick.bind(this));
                }
            }
        }
    }

    /**
     * Toggles if the calendar portion of the input should be shown or not
     * @param {HTMLElement} html The HTMLElement for the calendar input wrapper
     * @param {Event} event The click event that triggered this call
     */
    toggleCalendar(html: HTMLElement, event: Event){
        event.stopPropagation();
        const cal = <HTMLElement> html.querySelector('.sc-date-selector-calendar-wrapper');
        if(cal){
            if(cal.style.display === 'none'){
                cal.style.display = 'block';
            } else {
                cal.style.display = 'none';
            }
        }
    }

    /**
     * Hides the calendar portion of the input
     * @param {HTMLElement} html The HTMLElement for the calendar
     */
    hideCalendar(html: HTMLElement){
        this.secondDaySelect = false;
        const cal = <HTMLElement>html.querySelector('.sc-date-selector-calendar-wrapper');
        if(cal && !!( cal.offsetWidth || cal.offsetHeight || cal.getClientRects().length )){
            cal.style.display = 'none';
            if(this.onDateSelect){
                this.onDateSelect(this.selectedDate);
            }
        }
    }

    /**
     * If the calendar container div is clicked
     * @param {Event} event
     */
    calendarClick(event: Event){
        event.stopPropagation();
        Renderer.TimeSelector.HideTimeDropdown(this.timeSelectorId);

        // Hide all time dropdowns
        const wrapper = document.getElementById(this.id);
        if(wrapper){
            const dropdowns = wrapper.getElementsByClassName('time-dropdown');
            for(let i = 0; i < dropdowns.length; i++){
                dropdowns[i].classList.add('hide');
            }
        }
    }

    /**
     * Processes the selecting of a day on the calendar
     * @param {SCRenderer.CalendarOptions} options The renderer options returned from the click event
     */
    dayClick(options: SCRenderer.CalendarOptions){
        if(options.selectedDates){
            let hideCalendar = true;
            if(!this.secondDaySelect){
                this.selectedDate.startDate.year = options.selectedDates.start.year;
                this.selectedDate.startDate.month = SimpleCalendar.instance.activeCalendar.year.months[options.selectedDates.start.month].numericRepresentation;
                this.selectedDate.startDate.day = options.selectedDates.start.day || 1;
                this.selectedDate.endDate.year = options.selectedDates.start.year;
                this.selectedDate.endDate.month = SimpleCalendar.instance.activeCalendar.year.months[options.selectedDates.start.month].numericRepresentation;
                this.selectedDate.endDate.day = options.selectedDates.start.day || 1;
                this.secondDaySelect = true;
                hideCalendar = !this.dateRange;

            }else{
                this.selectedDate.startDate.year = options.selectedDates.start.year;
                this.selectedDate.startDate.month = SimpleCalendar.instance.activeCalendar.year.months[options.selectedDates.start.month].numericRepresentation;
                this.selectedDate.startDate.day = options.selectedDates.start.day || 1;
                this.selectedDate.endDate.year = options.selectedDates.end.year;
                this.selectedDate.endDate.month = SimpleCalendar.instance.activeCalendar.year.months[options.selectedDates.end.month].numericRepresentation;
                this.selectedDate.endDate.day = options.selectedDates.end.day || 1;
            }

            if(hideCalendar){
                const html = document.getElementById(this.id);
                if(html){
                    this.hideCalendar(html);
                }
            } else if(this.showTime){
                Renderer.TimeSelector.HideTimeDropdown(this.timeSelectorId);
            }
        }
    }

    /**
     * Processes the callback from the Calendar Renderer's month change click
     * @param clickType
     * @param options
     */
    changeMonthClick(clickType: CalendarClickEvents, options: SCRenderer.CalendarOptions){
        if(options.date){
            this.selectedDate.visibleDate.year = options.date.year;
            this.selectedDate.visibleDate.month = options.date.month;
        }
        this.activateListeners(null, true);
        if(this.showTime){
            Renderer.TimeSelector.HideTimeDropdown(this.timeSelectorId);
        }
    }

    /**
     * When the add time button is clicked to add a specific time for this note
     * @param {Event} event
     */
    addTimeClick(event: Event){
        event.stopPropagation();
        this.addTime = true;
        this.selectedDate.startDate.allDay = false;
        this.selectedDate.startDate.hour = 0;
        this.selectedDate.startDate.minute = 0;
        this.selectedDate.endDate.allDay = false;
        this.selectedDate.endDate.hour = 0;
        this.selectedDate.endDate.minute = 0;
        this.update();

    }

    /**
     * When the clear time button is clicked, will remove all time associated with this note
     * @param {Event} event
     */
    removeTimeClick(event: Event){
        event.stopPropagation();
        this.addTime = false;
        this.selectedDate.startDate.allDay = true;
        this.selectedDate.startDate.hour = 0;
        this.selectedDate.startDate.minute = 0;
        this.selectedDate.endDate.allDay = true;
        this.selectedDate.endDate.hour = 0;
        this.selectedDate.endDate.minute = 0;
        this.update();
    }

    timeChange(options: SCRenderer.TimeSelectorOptions){
        if(options.selectedTime){
            //If the day is the same, make sure that the end time is not before the start time
            if(Utilities.DateTheSame(this.selectedDate.startDate, this.selectedDate.endDate)){
                if(options.selectedTime.end.hour <= options.selectedTime.start.hour){
                    options.selectedTime.end.hour = options.selectedTime.start.hour;

                    if(options.selectedTime.end.minute < options.selectedTime.start.minute){
                        options.selectedTime.end.minute = options.selectedTime.start.minute;
                    }
                }
            }

            this.selectedDate.startDate.hour = options.selectedTime.start.hour;
            this.selectedDate.startDate.minute = options.selectedTime.start.minute;
            this.selectedDate.endDate.hour = options.selectedTime.end.hour;
            this.selectedDate.endDate.minute = options.selectedTime.end.minute;
            this.update();
            if(this.showTime && !this.showDate && this.onDateSelect){
                this.onDateSelect(this.selectedDate);
            }
        }
    }
}
