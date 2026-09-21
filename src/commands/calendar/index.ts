import { Command } from "commander";
import { calendarListCommand } from "./list.js";
import { calendarEventListCommand } from "./event-list.js";
import { calendarEventGetCommand } from "./event-get.js";

export const calendarCommand = new Command("calendar").description("캘린더 관련 명령");

calendarCommand.addCommand(calendarListCommand);

// event 서브커맨드 그룹 (post comment 의 중첩 방식과 동일)
const calendarEventCommand = new Command("event").description("일정 관련 명령");
calendarEventCommand.addCommand(calendarEventListCommand);
calendarEventCommand.addCommand(calendarEventGetCommand);
calendarCommand.addCommand(calendarEventCommand);
