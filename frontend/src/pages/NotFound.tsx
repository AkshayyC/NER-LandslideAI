import { Link } from 'react-router-dom';
import { Panel } from '../components/common/Panel';

export function NotFound() {
  return (
    <div className="page">
      <Panel kicker="404" title="Module not found">
        <p className="prose">
          The requested view does not exist in this console. Return to the Command Center.
        </p>
        <Link className="btn btn--primary" to="/">
          Command Center
        </Link>
      </Panel>
    </div>
  );
}
