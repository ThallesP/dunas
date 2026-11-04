import Image from "next/image"
import { XIcon } from "@/components/icons/x-icon"
import styles from "./posts.module.css"
import { xPosts } from "./x-posts"

export function Posts() {
  return (
    <section className={styles.posts}>
      <div className="wrap">
        <h2 className={`display ${styles.title}`}>Quem vende online já passou por isso.</h2>
        <ul className={styles.grid}>
          {xPosts.map((post) => (
            <li key={post.url} className={styles.item}>
              <a className={styles.card} href={post.url} target="_blank" rel="noreferrer">
                <div className={styles.head}>
                  <Image
                    className={styles.avatar}
                    src={post.avatar}
                    alt=""
                    width={38}
                    height={38}
                  />
                  <span className={styles.author}>
                    <b>{post.name}</b>
                    <span>@{post.handle}</span>
                  </span>
                  <span className={styles.x}>
                    <XIcon />
                  </span>
                </div>
                <p className={styles.text}>{post.text}</p>
                <time className={styles.date}>{post.date}</time>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
