import classNames from 'classnames'
import './FriendlyError.css'

function FriendlyError({
  className,
  heading,
  message,
}: {
  className?: string
  heading: string
  message: string
}) {
  return (
    <div className={classNames('FriendlyError', className)}>
      <div>
        <b className="FriendlyError__heading">{heading}</b>
      </div>
      <span className="FriendlyError__message">{message}</span>
    </div>
  )
}

export default FriendlyError
