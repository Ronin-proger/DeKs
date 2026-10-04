import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import PanelState from './PanelState';

export default function CalendarPanel({
  mode = 'next',
  events,
  todayKey,
  status,
  t,
  formatDate,
  onRetry,
  onOpen,
  months,
  weekdays,
  monthGrid,
  calendarMonth,
  onShiftMonth,
  selectedDate,
  onSelectDate,
  selectedEvents,
  draft,
  onDraft,
  onAdd,
  onDelete,
  dateKey,
}) {
  if (status === 'loading') return <PanelState text={t('panel_loading')} />;
  if (status === 'error') {
    return <PanelState text={t('panel_error')} actionLabel={t('panel_retry')} onAction={onRetry} />;
  }

  if (mode === 'next') {
    const next = [...events]
      .filter((event) => event.eventDate >= todayKey)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
    return (
      <div className="widget widget-calendar">
        <div className="widget-header">
          <span className="widget-title"><Calendar size={16} /> {t('home_event_title')}</span>
        </div>
        {!next ? (
          <PanelState text={t('home_event_empty')} actionLabel={t('home_event_add')} onAction={onOpen} />
        ) : (
          <>
            <div className="home-next-event">
              <strong>{next.title}</strong>
              <span>{formatDate(next.eventDate)}</span>
              {next.note ? <p>{next.note}</p> : null}
            </div>
            <button type="button" className="widget-btn" onClick={onOpen}>{t('dash_open_calendar')}</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="tracker-area-v2">
      <div className="calendar-toolbar">
        <button type="button" className="cal-nav-btn" onClick={() => onShiftMonth(-1)}><ChevronLeft size={18} /></button>
        <h3>{months[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</h3>
        <button type="button" className="cal-nav-btn" onClick={() => onShiftMonth(1)}><ChevronRight size={18} /></button>
      </div>
      <div className="tracker-calendar-main">
        <div className="calendar-full">
          {weekdays.map((day) => <div key={day} className="calendar-header">{day}</div>)}
          {monthGrid.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} className="calendar-day empty" />;
            const key = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
            const count = events.filter((event) => event.eventDate === key).length;
            return (
              <button
                key={key}
                type="button"
                className={`calendar-day selectable ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''}`}
                onClick={() => onSelectDate(key)}
              >
                <span className="day-num">{day}</span>
                {count > 0 && <span className="day-events-count">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="calendar-sidebar">
          <div className="calendar-selected-date">
            <Calendar size={16} />
            <span>{formatDate(selectedDate)}</span>
          </div>
          <div className="event-add-form">
            <input
              type="text"
              placeholder={t('calendar_event_title')}
              value={draft.title}
              onChange={(e) => onDraft({ ...draft, title: e.target.value })}
            />
            <textarea
              className="event-note-input"
              placeholder={t('calendar_event_note')}
              value={draft.note}
              onChange={(e) => onDraft({ ...draft, note: e.target.value })}
              rows={2}
            />
            <button type="button" className="primary-btn event-add-btn" onClick={onAdd}>
              <Plus size={16} /> {t('home_event_add')}
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <PanelState text={t('home_event_empty')} />
          ) : (
            <div className="events-list">
              {selectedEvents.map((event) => (
                <div key={event.id} className="event-chip">
                  <span className="event-dot" style={{ background: event.color || '#818cf8' }} />
                  <div className="event-chip-body">
                    <strong>{event.title}</strong>
                    {event.note ? <p className="event-note-text">{event.note}</p> : null}
                  </div>
                  <button type="button" onClick={() => onDelete(event.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
