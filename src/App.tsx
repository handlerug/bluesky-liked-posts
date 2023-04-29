import { FormEvent, useEffect, useState } from 'react'
import classNames from 'classnames'
import Post from './components/Post'
import FriendlyError from './components/FriendlyError'
import Spinner from './components/Spinner'
import { Like, fetchLikedPosts } from './utils/api'
import { DEFAULT_SERVICE, WEB_APP } from './utils/constants'
import './App.css'

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [profileHandle, setProfileHandle] = useState('')
  const [service, setService] = useState(DEFAULT_SERVICE)
  const [error, setError] = useState(null)
  const [likes, setLikes] = useState<Like[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const load = (cursor?: string) => {
    setError(null)

    return fetchLikedPosts({
      service,
      handle: profileHandle.toLowerCase().replace(/^@/, ''),
      cursor,
    })
      .then(({ likes: newLikes, cursor: newCursor }) => {
        if (cursor) {
          setLikes([...likes, ...newLikes])
        } else {
          setLikes(newLikes)
        }
        setCursor(newCursor)
      })
      .catch((error) => {
        setLikes([])
        setCursor(undefined)
        setError(error.message)
      })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsLoading(true)
    load().then(() => {
      setIsLoading(false)
    })
  }

  useEffect(() => {
    if (!cursor) {
      return
    }

    let fetchingMore = false
    function onScroll() {
      if (!fetchingMore && document.body.scrollHeight - window.scrollY < 2000) {
        fetchingMore = true
        load(cursor)
        // The cursor will change and the effect will run again
      }
    }
    onScroll()

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [cursor])

  return (
    <>
      <header className="App__header">
        <h1 className="App__heading">Show my likes! ❤️</h1>

        <p className="App__subtitle">
          Enter your handle and get a list of the profile's liked posts
        </p>

        <p className="App__credits">
          made by <a href={`${WEB_APP}/profile/handlerug.me`}>@handlerug.me</a>
          {' • '}
          <a href="https://github.com/handlerug/bluesky-liked-posts">
            source code
          </a>
        </p>
      </header>

      <main>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="profile-handle">Your profile handle</label>
            <input
              id="profile-handle"
              type="text"
              name="handle"
              placeholder="jesopo.bsky.social"
              value={profileHandle}
              onChange={(ev) => setProfileHandle(ev.target.value)}
            />
          </div>

          <div className="form-field">
            <details>
              <summary>Advanced settings</summary>

              <label htmlFor="service-url">ATProto service URL</label>
              <input
                id="service-url"
                type="text"
                name="service"
                placeholder={DEFAULT_SERVICE}
                value={service}
                onChange={(ev) => setService(ev.target.value)}
              />
            </details>
          </div>

          <div className="form-field">
            <button type="submit">Load likes!</button>
          </div>
        </form>

        <div
          className={classNames(
            'App__loading-card',
            isLoading && 'App__loading-card--visible'
          )}
          aria-hidden={!isLoading}
        >
          <div className="App__loading-card__inner">
            <Spinner />
            Loading your likes…
          </div>
        </div>

        {error ? (
          <FriendlyError
            className="App__like-error"
            heading="Error fetching likes"
            message={error}
          />
        ) : likes.length > 0 ? (
          <div
            className={classNames(
              'App__post-timeline',
              isLoading && 'App__post-timeline--loading'
            )}
          >
            {likes.map((like) =>
              'value' in like ? (
                <Post
                  key={like.uri}
                  uri={like.uri}
                  post={like.value}
                  service={service}
                />
              ) : (
                <FriendlyError
                  key={like.uri}
                  heading="Error fetching the post"
                  message={like.error}
                />
              )
            )}
            {cursor ? (
              <div
                className="App__post-loading-card"
                aria-label="Loading more posts"
              >
                <Spinner />
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </>
  )
}

export default App
