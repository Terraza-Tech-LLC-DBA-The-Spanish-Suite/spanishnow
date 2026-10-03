import { Link } from 'react-router-dom';

const FreeBooking = () => {
    return (
        // <!-- Google Calendar Appointment Scheduling begin -->
        <div className="">
            <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline mb-8 inline-block font-semibold">
                &larr; Back to Home
            </Link>
            <div className="bg-white sm:w-[70vw]">
                <iframe src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ1kscTCgkPGWkl8NaPhPJNI4K7FqUOJ1WE4QuFNIs8F6GF47pnfFhEp68ixV7q9jSjk-_-G-WJ7?gv=true" width="100%" className="color-white h-[80vh]" frameborder="0"></iframe>
            </div>
        </div>
        // <!-- end Google Calendar Appointment Scheduling -->
    )
}

export default FreeBooking;