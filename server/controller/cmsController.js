import CMSPage from "../Model/CMSPage.js";

// @desc    Get public CMS page (About, Terms, Privacy)
// @route   GET /api/cms/:slug
export const getCMSPage = async (req, res) => {
  try {
    const { slug } = req.params; // e.g., 'about-us'

    let page = await CMSPage.findOne({ slug });

    if (!page) {
      page = await CMSPage.create({
        slug: slug,
        title: slug.replace("-", " ").toUpperCase(),
        content: "<p>Content coming soon...</p>",
      });
    }

    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getAboutUs = (req, res) => {
  req.params.slug = "about-us";
  getCMSPage(req, res);
};

export const getPrivacyPolicy = (req, res) => {
  req.params.slug = "privacy-policy";
  getCMSPage(req, res);
};

export const getTerms = (req, res) => {
  req.params.slug = "terms";
  getCMSPage(req, res);
};

// @desc    Update CMS Page Content (Admin)
// @route   PUT /api/admin/cms/page/:pageId
export const updateCMSPage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { title, content } = req.body;

    let page = await CMSPage.findById(pageId);

    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    if (title) page.title = title;
    if (content) page.content = content;

    await page.save();
    res.json({ message: "Page updated successfully", page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllCMSPages = async (req, res) => {
  try {
    const pages = await CMSPage.find({}).select("slug title updatedAt");
    res.json(pages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
