import GuestbookStub from "@stub/guestbook.stub";
import ImageStub from "@stub/image.stub";
import PostCommentStub from "@stub/post-comment.stub";
import PostStub from "@stub/post.stub";
import ProjectStub from "@stub/project.stub";
import TagStub from "@stub/tag.stub";
import UserStub from "@stub/user.stub";

export const swaggerExamples = (function () {
  const image = new ImageStub();
  const user = new UserStub({ writable: true, image });
  const guestbook = new GuestbookStub({ user });
  const tag = new TagStub();
  const post = new PostStub({ user, tags: [tag], thumbnail: image });
  const postComment = new PostCommentStub({ user, post });
  const project = new ProjectStub({ thumbnail: image });

  return {
    image,
    user,
    guestbook,
    tag,
    post,
    postComment,
    project,
  };
})();
