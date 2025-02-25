import {ModuleName, NoteRepeat, SettingNames, SocketTypes, Themes} from "../../constants";
import {DateTheSame, DaysBetweenDates, FormatDateTime} from "../utilities/date-time";
import {GameSettings} from "../foundry-interfacing/game-settings";
import DateSelectorManager from "../date-selector/date-selector-manager";
import {CalManager, MainApplication, NManager, SC} from "../index";
import {animateElement, GetContrastColor} from "../utilities/visual";
import {getCheckBoxGroupValues, getNumericInputValue, getTextInputValue} from "../utilities/inputs";
import GameSockets from "../foundry-interfacing/game-sockets";
import {
    ConcreteJournalEntry
} from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/client/apps/forms/journal-sheet";

export class NoteSheet extends DocumentSheet{

    private dirty: boolean = false;

    private resized: boolean = false;

    private editMode: boolean = false;

    private advancedOpen: boolean = false;

    private readonly dateSelectorId: string;

    private static appWindowId: string = 'fsc-simple-calendar-note-journal-form';

    private journalData = {
        name: '',
        content: '',
        flags: <Record<string,any>>{},
        permission: <Partial<Record<string, 0 | 1 | 2 | 3>>>{}
    };
    /**
     * The HTML element representing the application window
     */
    public appWindow: HTMLElement | null = null;

    constructor(object: ConcreteJournalEntry, options = {}) {
        super(object, options);

        this.dateSelectorId = `scNoteDate_${this.object.id}`;
    }

    static get defaultOptions(){
        const options = super.defaultOptions;
        options.template = "modules/foundryvtt-simple-calendar/templates/note-sheet.html";
        options.title = "Simple Calendar Note";
        options.id = this.appWindowId;
        options.classes = ['sheet','journal-sheet','simple-calendar'];
        options.resizable = true;
        options.closeOnSubmit = false;
        if((<Game>game).settings){
            options.classes.push(GameSettings.GetStringSettings(SettingNames.Theme));
        }
        return options;
    }

    static get defaultObject() {
        return {};
    }

    get template() {
        return this.options.template || '';
    }

    get type() {
        return 'simplecalendarnote';
    }

    copyData(){
        this.journalData.name = this.object.data.name;
        this.journalData.content = this.object.data.content;
        this.journalData.flags = mergeObject({}, this.object.data.flags);
        this.journalData.permission = mergeObject({}, this.object.data.permission);
    }

    protected _getHeaderButtons(): Application.HeaderButton[] {
        const buttons = super._getHeaderButtons();
        const reducedButtons = [];
        for(let i = 0; i < buttons.length; i++){
            if(buttons[i].class === 'close' || buttons[i].class === 'configure-sheet'){
                reducedButtons.push(buttons[i]);
            }
        }
        return reducedButtons;
    }

    close(options?: FormApplication.CloseOptions): Promise<void> {
        if(this.dirty){
            const dialog = new Dialog({
                title: GameSettings.Localize('FSC.NoteDirty'),
                content: GameSettings.Localize("FSC.NoteDirtyText"),
                buttons:{
                    yes: {
                        icon: '<i class="fas fa-trash"></i>',
                        label: GameSettings.Localize('FSC.DiscardChanges'),
                        callback: this.isDirtyDialogClose.bind(this, false)
                    },
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: GameSettings.Localize('FSC.Save'),
                        callback: this.isDirtyDialogClose.bind(this, true)
                    }
                },
                default: "save"
            });
            dialog.render(true);
            return Promise.resolve();
        } else{
            this.dirty = false;
            this.editMode = false;
            this.resized = false;
            this.advancedOpen = false;
            return super.close(options);
        }
    }

    async isDirtyDialogClose(save: boolean){
        this.dirty = false;
        if(save){
            await this.save(new Event('click'));
        }
        return this.close();
    }

    render(force?: boolean, options?: Application.RenderOptions<DocumentSheetOptions>, startInEditMode?: boolean): this {
        if(startInEditMode !== undefined){
            this.editMode = startInEditMode;
        }
        return super.render(force, options);
    }

    getData(options?: Partial<DocumentSheetOptions>): Promise<DocumentSheet.Data> | DocumentSheet.Data {
        this.copyData();
        let newOptions = {
            ...super.getData(),
            editable: this.isEditable,
            editMode: this.editMode,
            name: '',
            display: {
                date: '',
                reminder: false,
                repeats: 0,
                repeatsDisplay: '',
                author: {colorText: '', color: '', name: ''},
                categories: <any>[],
                enrichedContent: '',
                macro: ''
            },
            edit: {
                dateDisplay: '',
                repeats: NoteRepeat.Never,
                noteData: {},
                users: <any>[],
                timeSelected: false,
                dateSelectorId: this.dateSelectorId,
                dateSelectorSelect: this.dateSelectorSelect.bind(this),
                repeatOptions: <SimpleCalendar.NoteRepeats>{0: 'FSC.Notes.Repeat.Never', 1: 'FSC.Notes.Repeat.Weekly', 2: 'FSC.Notes.Repeat.Monthly', 3: 'FSC.Notes.Repeat.Yearly'},
                allCategories: <any>[],
                advancedOpen: this.advancedOpen,
                macroList: <Record<string,string>>{'none': 'No Macro'},
                selectedMacro: ''
            }
        };

        const noteStub = NManager.getNoteStub(<JournalEntry>this.object);
        if(noteStub){
            newOptions.name = noteStub.title;
            if(this.editMode){
                newOptions.edit.noteData = noteStub.noteData || {};
                newOptions.edit.timeSelected = !noteStub.allDay;
                newOptions.edit.repeats = noteStub.repeats;
                const users = (<Game>game).users;
                if(users){
                    newOptions.edit.users = users.map(u => {return {
                        name: u.name,
                        id: u.id,
                        color: u.data.color,
                        textColor: GetContrastColor(u.color || ''),
                        selected: !!(this.object.data.permission[u.id] !== 0 && this.object.testUserPermission(u, 2)),
                        disabled: u.id === (<Game>game).user?.id
                    }});
                }
                const noteData = noteStub.noteData;
                if(noteData){
                    const calendar = CalManager.getCalendar(noteData.calendarId);
                    if(calendar){
                        newOptions.edit.dateDisplay = <string>FormatDateTime(noteData.startDate, 'MMMM DD, YYYY', calendar);
                        if(!DateTheSame(noteData.startDate, noteData.endDate)){
                            newOptions.edit.dateDisplay += ` - ${FormatDateTime(noteData.endDate, 'MMMM DD, YYYY', calendar)}`;
                        }
                        newOptions.edit.allCategories = calendar.noteCategories.map(nc => {
                            return {
                                name: nc.name,
                                color : nc.color,
                                textColor: nc.textColor,
                                selected: noteData.categories.find(c => c === nc.name) !== undefined
                            }
                        });
                    }
                }
                //Macros
                (<Game>game).macros?.forEach(m => {
                    if(m.canExecute && m.name){
                        newOptions.edit.macroList[m.id] = m.name;
                    }
                });
                newOptions.edit.selectedMacro = noteStub.macro;
            } else {
                newOptions.display.date = noteStub.fullDisplayDate;
                newOptions.display.reminder = noteStub.userReminderRegistered;
                newOptions.display.repeats = noteStub.repeats;
                newOptions.display.repeatsDisplay = GameSettings.Localize(newOptions.edit.repeatOptions[noteStub.repeats] || '');
                newOptions.display.author = noteStub.authorDisplay || {colorText: '', color: '', name: ''};
                newOptions.display.categories = noteStub.categories;
                newOptions.display.enrichedContent = TextEditor.enrichHTML(noteStub.content);
                if(this.isEditable){
                    newOptions.display.macro = (<Game>game).macros?.get(noteStub.macro)?.name || '';
                }
            }
        }
        return newOptions;
    }

    static setHeight(ns: NoteSheet){
        if(ns.appWindow && !ns.resized){
            const form = ns.appWindow.getElementsByTagName('form');
            if(form && form.length){
                let height = 46;//Header height and padding of form
                if(ns.editMode){
                    height += form[0].scrollHeight;
                } else {
                    const nHeader = <HTMLElement>ns.appWindow.querySelector('.fsc-note-header');
                    const nContent = <HTMLElement>ns.appWindow.querySelector('.fsc-content');
                    const nEditControls = <HTMLElement>ns.appWindow.querySelector('.fsc-edit-controls');
                    if(nHeader){
                        const cs = window.getComputedStyle(nHeader);
                        height += nHeader.offsetHeight + parseInt(cs.marginTop) + parseInt(cs.marginBottom);
                    }
                    if(nContent){
                        const cs = window.getComputedStyle(nContent);
                        height += nContent.scrollHeight + parseInt(cs.marginTop) + parseInt(cs.marginBottom);
                    }
                    if(nEditControls){
                        const cs = window.getComputedStyle(nEditControls);
                        height += nEditControls.offsetHeight + parseInt(cs.marginTop) + parseInt(cs.marginBottom);
                    }
                }

                if(ns.editMode && height < 845){
                    height = 845;
                }
                const maxHeight = window.outerHeight * .95;
                if(height > maxHeight){
                    height = maxHeight;
                }
                ns.setPosition({height: height, width: 720});
            }
        }
    }

    activateEditorCustom(){
        if(this.appWindow){
            const target = this.appWindow.querySelector('.fsc-editor-container .editor-content');
            if(target){
                let height = 0;
                const mceOptions = {
                    target: <HTMLElement>target,
                    body_class: 'simple-calendar',
                    content_css: ["/css/mce.css", `modules/${ModuleName}/styles/themes/tinymce-${SC.clientSettings.theme}.css`],
                    preview_styles: false,
                    height: height,
                    save_onsavecallback: (mce: any )=> this.saveEditor('content')
                };
                this.editors['content'] = {
                    target: 'content',
                    //@ts-ignore
                    button: target.nextElementSibling,
                    hasButton: false,
                    mce: null,
                    active: true,
                    changed: false,
                    options: mceOptions,
                    initial: (<JournalEntry>this.object).data.content
                };

                this.activateEditor('content', mceOptions, (<JournalEntry>this.object).data.content);
            }
        }
    }

    activateListeners(html: JQuery) {
        this.appWindow = document.getElementById(`${NoteSheet.appWindowId}-${this.object.id}`);
        if(this.appWindow){
            const themes = [Themes.light, Themes.dark, Themes.classic];
            this.appWindow.classList.remove(...themes);
            this.appWindow.classList.add(SC.clientSettings.theme);
            if(this.editMode){
                this.activateEditorCustom();
                DateSelectorManager.ActivateSelector(this.dateSelectorId);
                this.updateNoteRepeatDropdown();
                this.appWindow.querySelector('.fsc-note-advance')?.addEventListener('click', this.toggleAdvanced.bind(this));
                //---------------------
                // Input Changes
                //---------------------
                this.appWindow.querySelectorAll("input, select").forEach(e => {
                    e.addEventListener('change', this.inputChange.bind(this));
                });
            } else {
                //---------------------
                // Reminder Button Click
                //---------------------
                this.appWindow.querySelector('#scNoteReminder')?.removeAttribute('disabled');
                this.appWindow.querySelector('#scNoteReminder')?.addEventListener('click', this.reminderChange.bind(this));
            }
            //---------------------
            // Save/Edit/Delete Buttons
            //---------------------
            this.appWindow.querySelector('#scSubmit')?.addEventListener('click', this.save.bind(this));
            this.appWindow.querySelector('#scNoteEdit')?.addEventListener('click', this.edit.bind(this));
            this.appWindow.querySelector('#scNoteDelete')?.addEventListener('click', this.delete.bind(this));
        }
    }

    toggleAdvanced(){
        this.advancedOpen = !this.advancedOpen;
        if(this.appWindow){
            const header = this.appWindow.querySelector(".fsc-note-advance");
            const options = this.appWindow.querySelector(".fsc-options");
            if(header && options){
                header.innerHTML = this.advancedOpen ? `${GameSettings.Localize('FSC.HideAdvanced')}<span class='fa fa-chevron-up'></span>` : `${GameSettings.Localize('FSC.ShowAdvanced')}<span class='fa fa-chevron-down'></span>`;
                animateElement(options, 500);
            }
        }
    }

    async inputChange(){
        await this.writeInputValuesToObjects();
    }

    protected _onResize(event: Event) {
        this.resized = true;
        super._onResize(event);
    }

    async dateSelectorSelect(selectedDate: SimpleCalendar.DateTimeSelector.SelectedDates){
        const calendar = CalManager.getCalendar((<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).calendarId);
        if(calendar){
            const sMonthIndex = !selectedDate.startDate.month || selectedDate.startDate.month < 0? 0 : selectedDate.startDate.month;
            const sDayIndex = !selectedDate.startDate.day || selectedDate.startDate.day < 0? 0 : selectedDate.startDate.day;
            const eMonthIndex = !selectedDate.endDate.month || selectedDate.endDate.month < 0? 0 : selectedDate.endDate.month;
            const eDayIndex = !selectedDate.endDate.day || selectedDate.endDate.day < 0? 0 : selectedDate.endDate.day;

            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).allDay = !selectedDate.timeSelected;

            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).startDate = {
                year: selectedDate.startDate.year || 0,
                month: sMonthIndex,
                day: sDayIndex,
                hour: selectedDate.startDate.hour || 0,
                minute: selectedDate.startDate.minute || 0,
                seconds: selectedDate.startDate.seconds || 0
            };
            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).endDate = {
                year: selectedDate.endDate.year || 0,
                month: eMonthIndex,
                day: eDayIndex,
                hour: selectedDate.endDate.hour || 0,
                minute: selectedDate.endDate.minute || 0,
                seconds: selectedDate.endDate.seconds || 0
            };
            this.updateNoteRepeatDropdown();
        }
    }

    updateNoteRepeatDropdown(){
        if(this.appWindow){
            const selector = this.appWindow.querySelector('#scNoteRepeats');
            const noteData = <SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData;
            if(selector && noteData){
                const calendar = CalManager.getCalendar(noteData.calendarId);
                if(calendar){
                    //Adjust the repeat options so that you can't repeat if the days between the start and end date are longer than the different options
                    const daysBetween = DaysBetweenDates(calendar, noteData.startDate,noteData.endDate);
                    let options: Record<string, string>= {'0': 'FSC.Notes.Repeat.Never', '1': 'FSC.Notes.Repeat.Weekly', '2': 'FSC.Notes.Repeat.Monthly', '3': 'FSC.Notes.Repeat.Yearly'};
                    if(daysBetween >= calendar.totalNumberOfDays(false, true)){
                        delete options['1'];
                        delete options['2'];
                        delete options['3'];
                    } else if(daysBetween >= calendar.months[noteData.startDate.month].days.length){
                        delete options['1'];
                        delete options['2'];
                    }else if(daysBetween >= calendar.weekdays.length){
                        delete options['1'];
                    }
                    let optionsHTML = '';
                    for(let k in options){
                        const selected = noteData.repeats.toString() === k;
                        optionsHTML += `<option value="${k}" ${selected? 'selected' : ''}>${GameSettings.Localize(options[k])}</option>`
                    }
                    selector.innerHTML = optionsHTML;
                }
            }
        }
    }

    async writeInputValuesToObjects(){
        if(this.appWindow){
            this.journalData.name = getTextInputValue('#scNoteTitle', <string>Themes.dark, this.appWindow);
            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).repeats = <NoteRepeat>getNumericInputValue('#scNoteRepeats', NoteRepeat.Never, false, this.appWindow);
            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).categories = getCheckBoxGroupValues('scNoteCategories', this.appWindow);
            (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).macro = getTextInputValue('#scNoteMacro', 'none', this.appWindow);

            const usersWithView = getCheckBoxGroupValues('scUserPermissions', this.appWindow);
            for(let k in this.journalData.permission){
                if(this.journalData.permission[k] !== 3){
                    this.journalData.permission[k] = 0;
                }
            }
            for(let i = 0; i < usersWithView.length; i++){
                const permissionValue = this.journalData.permission[usersWithView[i]];
                if(permissionValue === undefined || permissionValue < 2){
                    this.journalData.permission [usersWithView[i]] = 2;
                } else if(permissionValue === 3){
                    this.journalData.permission [usersWithView[i]] = 3;
                }
            }
            if(this.editors['content']){
                this.journalData.content = this.editors['content'].mce?.getContent() || '';
            }
            this.dirty = true;
        }
    }

    async reminderChange(){
        const user = (<Game>game).user;
        if(user){
            const userId = user.id;
            //If the current user can edit the journal entry, then just edit it
            if((<JournalEntry>this.object).testUserPermission(user, 3)) {

                const userIndex = (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).remindUsers.indexOf(userId);
                if(userId !== '' && userIndex === -1){
                    (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).remindUsers.push(userId);
                } else if(userId !== '' && userIndex !== -1) {
                    (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).remindUsers.splice(userIndex, 1);
                }
                await (<JournalEntry>this.object).update(this.journalData);
            }
            //Otherwise, we need to send it to the GM to make the change
            else {
                const socket = <SimpleCalendar.SimpleCalendarSocket.Data>{
                    type: SocketTypes.noteUpdate,
                    data: {
                        userId: userId,
                        journalId: (<JournalEntry>this.object).id
                    }
                };
                await GameSockets.emit(socket);
            }
            this.render(true);
            MainApplication.updateApp();
        }
    }

    async edit(e: Event){
        e.preventDefault();
        this.resized = false;
        this.editMode = true;
        this.render(true);
    }

    async save(e: Event){
        e.preventDefault();
        await this.writeInputValuesToObjects();
        (<SimpleCalendar.NoteData>this.journalData.flags[ModuleName].noteData).fromPredefined = false;
        await (<JournalEntry>this.object).update(this.journalData);
        MainApplication.updateApp();
        await GameSockets.emit({type: SocketTypes.mainAppUpdate, data: {}});
        this.resized = false;
        this.editMode = false;
        this.dirty = false;
        this.render(true);
    }

    delete(e: Event){
        e.preventDefault();
        const dialog = new Dialog({
            title: GameSettings.Localize('FSC.DeleteConfirm'),
            content: GameSettings.Localize("FSC.DeleteConfirmText"),
            buttons:{
                yes: {
                    icon: '<i class="fas fa-trash"></i>',
                    label: GameSettings.Localize('FSC.Delete'),
                    callback: this.deleteConfirm.bind(this)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: GameSettings.Localize('FSC.Cancel')
                }
            },
            default: "no"
        });
        dialog.render(true);
    }

    async deleteConfirm(){
        NManager.removeNoteStub((<JournalEntry>this.object));
        MainApplication.updateApp();
        await (<JournalEntry>this.object).delete();
        await GameSockets.emit({type: SocketTypes.mainAppUpdate, data: {}});
        await this.close();
    }

}