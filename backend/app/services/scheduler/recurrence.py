from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timedelta, timezone

from app.models.db_models import RecurrenceType, ScheduledTask
from app.services.exceptions import SchedulerException


def _calculate_daily_execution(
    from_time: datetime, hour: int, minute: int, second: int
) -> datetime:
    next_date = from_time.date()
    next_dt = datetime(
        next_date.year,
        next_date.month,
        next_date.day,
        hour,
        minute,
        second,
        tzinfo=timezone.utc,
    )
    if next_dt <= from_time:
        next_date = next_date + timedelta(days=1)
        next_dt = datetime(
            next_date.year,
            next_date.month,
            next_date.day,
            hour,
            minute,
            second,
            tzinfo=timezone.utc,
        )
    return next_dt


def calculate_next_datetime(
    recurrence_type: RecurrenceType,
    scheduled_time: str,
    scheduled_day: int | None,
    from_time: datetime,
    allow_once: bool = False,
) -> datetime | None:
    # Calculates the next execution time for recurring tasks, handling edge cases:
    # - WEEKLY: Uses modulo arithmetic to find days until target weekday. If target is
    #   today but time has passed, schedules for next week (days_ahead = 7).
    # - MONTHLY: Handles months with fewer days (e.g., scheduling for the 31st in February
    #   will use the 28th/29th). If target day passed this month, rolls to next month.
    time_parts = scheduled_time.split(":")
    hour = int(time_parts[0])
    minute = int(time_parts[1])
    second = int(time_parts[2]) if len(time_parts) == 3 else 0

    if recurrence_type == RecurrenceType.ONCE:
        if not allow_once:
            return None
        return _calculate_daily_execution(from_time, hour, minute, second)

    elif recurrence_type == RecurrenceType.DAILY:
        return _calculate_daily_execution(from_time, hour, minute, second)

    elif recurrence_type == RecurrenceType.WEEKLY:
        if scheduled_day is None or scheduled_day < 0 or scheduled_day > 6:
            raise SchedulerException("Weekly tasks require scheduled_day (0-6)")

        target_weekday = scheduled_day
        current_date = from_time.date()
        current_weekday = current_date.weekday()

        days_ahead = (target_weekday - current_weekday) % 7

        if days_ahead == 0:
            test_dt = datetime(
                current_date.year,
                current_date.month,
                current_date.day,
                hour,
                minute,
                second,
                tzinfo=timezone.utc,
            )
            if test_dt <= from_time:
                days_ahead = 7

        next_date = current_date + timedelta(days=days_ahead)
        next_dt = datetime(
            next_date.year,
            next_date.month,
            next_date.day,
            hour,
            minute,
            second,
            tzinfo=timezone.utc,
        )

        return next_dt

    elif recurrence_type == RecurrenceType.MONTHLY:
        if scheduled_day is None or scheduled_day < 1 or scheduled_day > 31:
            raise SchedulerException("Monthly tasks require scheduled_day (1-31)")

        target_day = scheduled_day
        current_date = from_time.date()

        year = current_date.year
        month = current_date.month
        max_day = monthrange(year, month)[1]
        day = min(target_day, max_day)

        test_dt = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)

        if test_dt <= from_time:
            if month == 12:
                month = 1
                year += 1
            else:
                month += 1

            max_day = monthrange(year, month)[1]
            day = min(target_day, max_day)

        next_dt = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)

        return next_dt

    raise SchedulerException(f"Unexpected recurrence type: {recurrence_type}")


def calculate_next_execution(
    task: ScheduledTask, from_time: datetime | None = None
) -> datetime | None:
    if from_time is None:
        from_time = datetime.now(timezone.utc)

    return calculate_next_datetime(
        task.recurrence_type,
        task.scheduled_time,
        task.scheduled_day,
        from_time,
        allow_once=False,
    )


def calculate_initial_next_execution(
    recurrence_type: RecurrenceType,
    scheduled_time: str,
    scheduled_day: int | None = None,
) -> datetime:
    now = datetime.now(timezone.utc)

    result = calculate_next_datetime(
        recurrence_type, scheduled_time, scheduled_day, now, allow_once=True
    )

    if result is None:
        raise SchedulerException(
            f"Could not calculate next execution for {recurrence_type}"
        )

    return result


def validate_recurrence_constraints(
    recurrence_type: RecurrenceType, scheduled_day: int | None
) -> None:
    if recurrence_type == RecurrenceType.WEEKLY:
        if scheduled_day is None or not (0 <= scheduled_day <= 6):
            raise SchedulerException(
                "Weekly tasks require scheduled_day between 0 (Monday) and 6 (Sunday)"
            )
    elif recurrence_type == RecurrenceType.MONTHLY:
        if scheduled_day is None or not (1 <= scheduled_day <= 31):
            raise SchedulerException(
                "Monthly tasks require scheduled_day between 1 and 31"
            )
