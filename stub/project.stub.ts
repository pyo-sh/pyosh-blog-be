import { faker } from "@faker-js/faker";
import { ProjectEntity } from "@src/entities/project.entity";
import DefaultStub, { StubDateInputType } from "@stub/default.stub";
import type ImageStub from "@stub/image.stub";

interface ProjectFrame extends Omit<ProjectEntity, "thumbnail"> {
  thumbnail?: ImageStub;
}
interface ProjectStubInput
  extends Omit<ProjectFrame, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: StubDateInputType;
  updatedAt: StubDateInputType;
  deletedAt: StubDateInputType | null;
}

export default class ProjectStub extends DefaultStub implements ProjectFrame {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  thumbnailId: number | null;
  // *: Typeorm Entity
  thumbnail?: ImageStub;

  constructor(projectData?: Partial<ProjectStubInput>) {
    super();

    const {
      id,
      content,
      createdAt,
      updatedAt,
      deletedAt,
      thumbnail,
      thumbnailId,
    } = projectData ?? {};

    this.setId(id);
    this.setContent(content);
    this.setCreatedAt(createdAt);
    this.setUpdatedAt(updatedAt);

    this.setDeletedAt(deletedAt ?? null);

    if (thumbnail) {
      this.setThumbnail(thumbnail);
    } else {
      this.setThumbnailId(thumbnailId ?? null);
    }
  }

  setContent(content?: ProjectStubInput["content"]) {
    this.content = content ?? faker.lorem.paragraphs();

    return this;
  }

  setCreatedAt(createdAt?: ProjectStubInput["createdAt"]) {
    this.createdAt = this.selectValidDate(createdAt, faker.date.recent());

    return this;
  }

  setUpdatedAt(updatedAt?: ProjectStubInput["updatedAt"]) {
    this.updatedAt = this.selectValidDate(
      updatedAt,
      faker.date.recent({ refDate: this.createdAt }),
    );

    return this;
  }

  setDeletedAt(deletedAt?: ProjectStubInput["deletedAt"]) {
    if (deletedAt === null) {
      this.deletedAt = null;
    } else {
      this.deletedAt = this.selectValidDate(
        deletedAt,
        faker.date.recent({ refDate: this.updatedAt }),
      );
    }

    return this;
  }

  setThumbnailId(thumbnailId: ProjectStubInput["thumbnailId"]) {
    this.thumbnailId = thumbnailId;

    return this;
  }

  setThumbnail(thumbnail: ProjectStubInput["thumbnail"]) {
    this.setThumbnailId(thumbnail.id);
    this.thumbnail = thumbnail;

    return this;
  }
}
