import { expect } from "chai";
import ImageRepository from "@src/domains/image/image.repository";
import ProjectRepository from "@src/domains/project/project.repository";
import ImageStub from "@stub/image.stub";
import ProjectStub from "@stub/project.stub";
import mockInstance from "@test/utils/mockInstance";

describe("Project Repository Test", () => {
  const imageRepository = mockInstance(ImageRepository);
  const projectRepository = mockInstance(ProjectRepository);

  it("thumbnail(Image) can be created with project repository (CASCADE)", async () => {
    const imageStub = new ImageStub();
    const projectStub = new ProjectStub({ thumbnail: imageStub });

    const newProject = await projectRepository.save(projectStub);
    const createdImage = await imageRepository.findOneBy({
      id: newProject.thumbnailId,
    });

    expect(createdImage).to.be.deep.equal(imageStub);
  });

  it("thumbnailId should be null when Image deleted (onDelete SET NULL) [not soft delete]", async () => {
    const imageStub = new ImageStub();
    const newImage = await imageRepository.save(imageStub);
    const projectStub = new ProjectStub({ thumbnail: imageStub });
    const newProject = await projectRepository.save(projectStub);

    await imageRepository.delete(newImage.id);
    const foundImage = await imageRepository.findOneBy({ id: newImage.id });
    const foundProject = await projectRepository.findOneBy({
      id: newProject.id,
    });

    expect(newProject.thumbnailId).to.be.equal(newImage.id);
    expect(foundImage).to.be.null;
    expect(foundProject.thumbnailId).to.be.null;
  });
});
