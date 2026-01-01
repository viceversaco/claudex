from app.models.db_models import RecurrenceType, ScheduledTask
from app.services.exceptions import SchedulerException


def _format_weekly(task: ScheduledTask) -> str:
    days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]
    day_name = (
        days[task.scheduled_day]
        if task.scheduled_day is not None and 0 <= task.scheduled_day <= 6
        else "Unknown"
    )
    return f"Weekly on {day_name} at {task.scheduled_time}"


def _format_monthly(task: ScheduledTask) -> str:
    suffix = "th"
    if task.scheduled_day in [1, 21, 31]:
        suffix = "st"
    elif task.scheduled_day in [2, 22]:
        suffix = "nd"
    elif task.scheduled_day in [3, 23]:
        suffix = "rd"
    return f"Monthly on the {task.scheduled_day}{suffix} at {task.scheduled_time}"


def format_recurrence_description(task: ScheduledTask) -> str:
    if task.recurrence_type == RecurrenceType.ONCE:
        return f"Once at {task.scheduled_time}"
    elif task.recurrence_type == RecurrenceType.DAILY:
        return f"Daily at {task.scheduled_time}"
    elif task.recurrence_type == RecurrenceType.WEEKLY:
        return _format_weekly(task)
    elif task.recurrence_type == RecurrenceType.MONTHLY:
        return _format_monthly(task)
    raise SchedulerException(f"Unexpected recurrence type: {task.recurrence_type}")
