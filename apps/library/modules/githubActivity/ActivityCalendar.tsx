"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ActivityCalendar as ReactActivityCalendar } from "react-activity-calendar";
import { makeComponentView } from "../../make/makeComponentView";
import { activityCalendarComponent } from "./generator/ActivityCalendarComponent";

export const activityCalendarView = makeComponentView(activityCalendarComponent, {
  component(props) {
    const { contributions } = props;
    const calendarRef = useRef<HTMLElement>(null);
    const [isAtStart, setIsAtStart] = useState(true);
    const [isAtEnd, setIsAtEnd] = useState(true);

    useLayoutEffect(() => {
      const scroller = calendarRef.current?.querySelector<HTMLElement>(
        ".react-activity-calendar__scroll-container",
      );
      if (!scroller) return;

      const updateScrollEdges = () => {
        setIsAtStart(scroller.scrollLeft <= 1);
        setIsAtEnd(scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1);
      };
      let hasInitialScroll = false;

      // The brick shell may receive its width after the calendar mounts.
      const observer = new ResizeObserver(() => {
        if (scroller.clientWidth === 0) return;
        if (!hasInitialScroll) {
          scroller.scrollLeft = scroller.scrollWidth;
          hasInitialScroll = true;
        }
        updateScrollEdges();
      });
      observer.observe(scroller);
      scroller.addEventListener("scroll", updateScrollEdges, { passive: true });
      return () => {
        observer.disconnect();
        scroller.removeEventListener("scroll", updateScrollEdges);
      };
    }, []);

    let maskClassName = "";
    if (!isAtStart && !isAtEnd) {
      maskClassName =
        "[&_[class$=scroll-container]]:[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%_-_20px),transparent)]";
    } else if (!isAtStart) {
      maskClassName =
        "[&_[class$=scroll-container]]:[mask-image:linear-gradient(to_right,transparent,black_20px)]";
    } else if (!isAtEnd) {
      maskClassName =
        "[&_[class$=scroll-container]]:[mask-image:linear-gradient(to_right,black_calc(100%_-_20px),transparent)]";
    }

    return (
      <div
        data-github-activity
        className="flex h-full min-w-0 w-full items-center overflow-hidden bg-white px-3 py-2 [&_[class$=legend-colors]]:ml-0!"
      >
        <div className="flex min-w-0 w-full items-start">
          {/* Match the calendar's 18px month header, 11px row pitch, and 1px top padding. */}
          <svg width={26} height={94} className="shrink-0" fontSize={10}>
            {["Mon", "Wed", "Fri"].map((day, index) => (
              <text
                key={day}
                x={18}
                y={34.5 + index * 22}
                dominantBaseline="central"
                textAnchor="end"
                fill="currentColor"
              >
                {day}
              </text>
            ))}
          </svg>
          {/* Only the grid scrolls; weekday labels and the calendar footer stay fixed. */}
          <ReactActivityCalendar
            ref={calendarRef}
            className={`min-w-0 flex-1 [&_[class$=scroll-container]]:[scrollbar-width:none] [&_[class$=scroll-container]::-webkit-scrollbar]:hidden ${maskClassName}`}
            data={contributions}
            blockMargin={2}
            blockRadius={2}
            blockSize={9}
            colorScheme="light"
            fontSize={10}
            showTotalCount={false}
            showMonthLabels={true}
            showColorLegend={true}
            showWeekdayLabels={false}
          />
        </div>
      </div>
    );
  },
});
