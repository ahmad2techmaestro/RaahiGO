import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// De-duplicated by id so rapid repeats don't stack identical toasts.
export const success = (title) => toast.success(title, { toastId: `s:${title}` });
export const error = (title) => toast.error(title, { toastId: `e:${title}` });
export const info = (title) => toast.info(title, { toastId: `i:${title}` });
