import { useMemo, useState, useEffect } from 'react'
import {
  AppBskyActorProfile,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedPost,
  AtUri,
} from '@atproto/api'
import classNames from 'classnames'
import RichText from './RichText'
import FriendlyError from './FriendlyError'
import { fetchPost, fetchProfile, getBlobURL } from '../utils/api'
import { getRelativeDateString } from '../utils/datetime'
import './Post.css'
import { WEB_APP } from '../utils/constants'

function PostImages({
  did,
  images,
}: {
  did: string
  images: AppBskyEmbedImages.Image[]
}) {
  if (images.length === 1) {
    return (
      <img
        className="Post__image"
        src={getBlobURL(did, images[0].image)}
        alt={images[0].alt}
      />
    )
  }

  return (
    <div className="Post__images">
      {images.map((image, idx) => (
        <img key={idx} src={getBlobURL(did, image.image)} alt={image.alt} />
      ))}
    </div>
  )
}

function Post({
  className,
  uri,
  post,
  isEmbedded = false,
}: {
  className?: string
  uri: string
  post: AppBskyFeedPost.Record
  isEmbedded?: boolean
}) {
  const atUri = useMemo(() => new AtUri(uri), [uri])

  const [profile, setProfile] = useState<{
    uri: string
    handle: string
    profile: AppBskyActorProfile.Record
  } | null>(null)

  const [profileError, setProfileError] = useState<string | null>(null)

  const [embeddedPost, setEmbeddedPost] = useState<{
    uri: string
    record: AppBskyFeedPost.Record
  } | null>(null)
  const [embeddedPostError, setEmbeddedPostError] = useState<string | null>(
    null
  )

  const [parentPost, setParentPost] = useState<AppBskyFeedPost.Record | null>(
    null
  )
  const [parentPostError, setParentPostError] = useState<string | null>(null)

  const profileImage = useMemo(() => {
    if (!profile) {
      return null
    }

    if (!profile.profile.avatar) {
      return null
    }

    return getBlobURL(atUri.hostname, profile.profile.avatar)
  }, [profile])

  const [date, relativeDate] = useMemo(() => {
    const date = new Date(post.createdAt)
    return [date, getRelativeDateString(date)]
  }, [post.createdAt])

  useEffect(() => {
    if (isEmbedded || !post.reply) {
      return () => {}
    }

    const abortController = new AbortController()

    fetchPost(post.reply.parent.uri, post.reply.parent.cid)
      .then((result) => {
        if (abortController.signal.aborted) {
          return
        }

        setParentPost(result)
      })
      .catch((error) => {
        setParentPostError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [isEmbedded, post.reply?.parent.uri, post.reply?.parent.cid])

  useEffect(() => {
    const abortController = new AbortController()

    fetchProfile(atUri.hostname)
      .then((result) => {
        if (abortController.signal.aborted) {
          return
        }

        setProfile(result)
      })
      .catch((error) => {
        setProfileError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [atUri.hostname])

  useEffect(() => {
    if (isEmbedded) {
      return
    }

    if (
      !AppBskyEmbedRecord.isMain(post.embed) &&
      !AppBskyEmbedRecordWithMedia.isMain(post.embed)
    ) {
      return
    }
    const record = AppBskyEmbedRecord.isMain(post.embed)
      ? post.embed.record
      : post.embed.record.record

    const abortController = new AbortController()

    fetchPost(record.uri, record.cid)
      .then((data) => {
        if (abortController.signal.aborted) {
          return
        }

        setEmbeddedPost({ uri: record.uri, record: data })
      })
      .catch((error) => {
        setEmbeddedPostError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [
    isEmbedded,
    post.embed && AppBskyEmbedRecord.isMain(post.embed),
    post.embed && AppBskyEmbedRecordWithMedia.isMain(post.embed),
  ])

  const postNode = (
    <article
      className={classNames('Post', isEmbedded && 'Post--embed', className)}
    >
      {profileImage ? (
        <img className="Post__avatar" src={profileImage} />
      ) : (
        <div className="Post__avatar-placeholder" />
      )}
      <a
        className="Post__author-name"
        href={`${WEB_APP}/profile/${profile ? profile.handle : atUri.hostname}`}
      >
        {profile?.profile.displayName ?? profile?.handle ?? atUri.hostname}
      </a>{' '}
      {profile ? (
        <span className="Post__author-handle">@{profile.handle}</span>
      ) : null}
      <a
        className="Post__relative-date"
        href={`${WEB_APP}/profile/${atUri.hostname}/post/${atUri.rkey}`}
      >
        <time
          dateTime={date.toISOString()}
          title={date.toLocaleString()}
          aria-label={`${relativeDate} — click to open the post in the Bluesky web app`}
        >
          {relativeDate}
        </time>
      </a>
      <div className="Post__content">
        <RichText text={post.text} facets={post.facets} />
      </div>
      {!isEmbedded && post.embed ? (
        AppBskyEmbedImages.isMain(post.embed) ? (
          <PostImages did={atUri.hostname} images={post.embed.images} />
        ) : AppBskyEmbedRecordWithMedia.isMain(post.embed) ? (
          <>
            {AppBskyEmbedImages.isMain(post.embed.media) ? (
              <PostImages
                did={atUri.hostname}
                images={post.embed.media.images}
              />
            ) : null}
          </>
        ) : null
      ) : null}
      {embeddedPost ? (
        <Post
          className="Post__post-embed"
          uri={embeddedPost.uri}
          post={embeddedPost.record}
          isEmbedded
        />
      ) : null}
      {profileError ? (
        <FriendlyError
          className="Post__profile-error"
          heading="Error fetching author's profile"
          message={profileError}
        />
      ) : null}
      {embeddedPostError ? (
        <FriendlyError
          className="Post__post-embed-error"
          heading="Error fetching the quoted post"
          message={embeddedPostError}
        />
      ) : null}
      {isEmbedded && (
        <a
          className="Post__link"
          href={`${WEB_APP}/profile/${atUri.hostname}/post/${atUri.rkey}`}
        >
          Open post in the Bluesky web app
        </a>
      )}
    </article>
  )

  if (post.reply && parentPost) {
    return (
      <div className="PostThread">
        <Post
          uri={post.reply.parent.uri}
          post={{
            ...parentPost,
            reply: undefined,
          }}
        />
        {postNode}
      </div>
    )
  }

  if (post.reply && parentPostError) {
    return (
      <>
        <FriendlyError
          heading="Error fetching parent post"
          message={parentPostError}
        />
        {postNode}
      </>
    )
  }

  return postNode
}

export default Post
